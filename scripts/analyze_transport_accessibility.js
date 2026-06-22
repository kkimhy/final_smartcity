const fs = require("fs");
const path = require("path");
const shapefile = require("shapefile");
const proj4 = require("proj4");
const turf = require("@turf/turf");

const baseDir = path.resolve(__dirname, "..");
const ANALYSIS_DATE = "2026-06-22";
const ISOCHRONE_THRESHOLDS_MIN = [30, 60];
const CURVE_MAX_MIN = 60;
const STATION_CATCHMENT_M = 500;
const STATION_AREA_BUFFERS_M = [500, 1000];

proj4.defs(
  "EPSG:5179",
  "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs"
);
proj4.defs(
  "EPSG:5186",
  "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs"
);
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

const METRO_DATASETS = [
  {
    name: "seoul",
    censusShpPath: "bnd_oa_11_2025_2Q/bnd_oa_11_2025_2Q.shp",
    censusDbfPath: "bnd_oa_11_2025_2Q/bnd_oa_11_2025_2Q.dbf",
    populationCsvPath: "_census_reqdoc_1782066603658/11_2024년_인구총괄(총인구).csv",
    workersCsvPath: "_census_reqdoc_1782066603658/11_2023년_산업분류별(10차_대분류)_종사자수.csv"
  },
  {
    name: "incheon",
    censusShpPath: "bnd_oa_23_2025_2Q/bnd_oa_23_2025_2Q.shp",
    censusDbfPath: "bnd_oa_23_2025_2Q/bnd_oa_23_2025_2Q.dbf",
    populationCsvPath: "_census_reqdoc_1782066604601/23_2024년_인구총괄(총인구).csv",
    workersCsvPath: "_census_reqdoc_1782066604601/23_2023년_산업분류별(10차_대분류)_종사자수.csv"
  },
  {
    name: "gyeonggi",
    censusShpPath: "bnd_oa_31_2025_2Q/bnd_oa_31_2025_2Q.shp",
    censusDbfPath: "bnd_oa_31_2025_2Q/bnd_oa_31_2025_2Q.dbf",
    populationCsvPath: "_census_reqdoc_1782066604053/31_2024년_인구총괄(총인구).csv",
    workersCsvPath: "_census_reqdoc_1782066604053/31_2023년_산업분류별(10차_대분류)_종사자수.csv"
  }
];

const siteConfigs = [
  {
    siteId: "pangyo",
    siteName: "판교",
    boundaryPath: "data/raw/boundary/pangyo_urban_support_only.geojson"
  },
  {
    siteId: "okjeong",
    siteName: "옥정",
    boundaryPath: "data/raw/boundary/okjeong_urban_support_only.geojson"
  }
];

function abs(relativePath) {
  return path.join(baseDir, relativePath);
}

function ensureDir(relativePath) {
  fs.mkdirSync(abs(relativePath), { recursive: true });
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(abs(relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  fs.writeFileSync(abs(relativePath), JSON.stringify(value, null, 2), "utf8");
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(relativePath, rows) {
  if (!rows.length) {
    fs.writeFileSync(abs(relativePath), "", "utf8");
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map(row => headers.map(header => csvEscape(row[header])).join(","))
  ];
  fs.writeFileSync(abs(relativePath), lines.join("\n"), "utf8");
}

function readDelimited(relativePath, delimiter) {
  const [headerLine, ...lines] = fs.readFileSync(abs(relativePath), "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  const headers = headerLine.split(delimiter);
  return lines.map(line => {
    const values = line.split(delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function readMetricCsv(relativePath) {
  const rows = fs.readFileSync(abs(relativePath), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => line.split(","));
  const map = new Map();
  for (const row of rows) {
    const oaCode = row[1];
    const raw = row[3];
    const normalized = raw == null ? "" : String(raw).trim();
    const value = normalized && normalized !== "N/A"
      ? Number(normalized.replace(/,/g, "")) || 0
      : 0;
    map.set(oaCode, value);
  }
  return map;
}

function mergeMetricMaps(metricMaps) {
  const merged = new Map();
  for (const map of metricMaps) {
    for (const [key, value] of map.entries()) {
      merged.set(key, value);
    }
  }
  return merged;
}

function parsePointWkt(wkt) {
  const match = /^POINT\s*\(([-\d.]+)\s+([-\d.]+)\)$/i.exec(wkt.trim());
  if (!match) throw new Error(`Unsupported POINT WKT: ${wkt}`);
  return [Number(match[1]), Number(match[2])];
}

function transformCoords(coords, fromCrs, toCrs) {
  if (typeof coords[0] === "number") return proj4(fromCrs, toCrs, coords);
  return coords.map(part => transformCoords(part, fromCrs, toCrs));
}

function transformGeometry(geometry, fromCrs, toCrs) {
  return {
    ...geometry,
    coordinates: transformCoords(geometry.coordinates, fromCrs, toCrs)
  };
}

function isActiveDate(begin, effectiveBegin, cutoff) {
  const activeBegin = effectiveBegin && effectiveBegin.trim() ? effectiveBegin.trim() : begin.trim();
  return activeBegin <= cutoff;
}

function readNodes() {
  return readDelimited("data/raw/subway/nodes.tsv", "\t")
    .filter(row => isActiveDate(row.begin, row.effective_begin, ANALYSIS_DATE))
    .map(row => ({
      id: Number(row.id),
      stationName: row.statnm,
      lineName: row.linenm,
      begin: row.begin,
      effectiveBegin: row.effective_begin,
      lng: Number(row.lng),
      lat: Number(row.lat),
      point5179: parsePointWkt(row.geometry_wkt)
    }));
}

function readLinks() {
  return readDelimited("data/raw/subway/links.tsv", "\t")
    .filter(row => row.begin.trim() <= ANALYSIS_DATE)
    .map(row => ({
      fromNode: Number(row.fromNode),
      toNode: Number(row.toNode),
      timeFT: Number(row.timeFT),
      timeTF: Number(row.timeTF)
    }));
}

function buildAdjacency(nodes, links) {
  const adjacency = new Map(nodes.map(node => [node.id, []]));
  for (const link of links) {
    if (!adjacency.has(link.fromNode) || !adjacency.has(link.toNode)) continue;
    adjacency.get(link.fromNode).push({ to: link.toNode, cost: link.timeFT });
    adjacency.get(link.toNode).push({ to: link.fromNode, cost: link.timeTF });
  }
  return adjacency;
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].cost <= this.items[index].cost) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  pop() {
    if (!this.items.length) return null;
    const min = this.items[0];
    const end = this.items.pop();
    if (this.items.length) {
      this.items[0] = end;
      this.sinkDown(0);
    }
    return min;
  }

  sinkDown(index) {
    const length = this.items.length;
    while (true) {
      let left = index * 2 + 1;
      let right = left + 1;
      let smallest = index;
      if (left < length && this.items[left].cost < this.items[smallest].cost) smallest = left;
      if (right < length && this.items[right].cost < this.items[smallest].cost) smallest = right;
      if (smallest === index) break;
      [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]];
      index = smallest;
    }
  }

  get size() {
    return this.items.length;
  }
}

function dijkstra(adjacency, sourceIds) {
  const distances = new Map();
  const heap = new MinHeap();

  for (const sourceId of sourceIds) {
    distances.set(sourceId, 0);
    heap.push({ nodeId: sourceId, cost: 0 });
  }

  while (heap.size) {
    const current = heap.pop();
    if (!current) break;
    if (current.cost > (distances.get(current.nodeId) ?? Infinity)) continue;

    for (const edge of adjacency.get(current.nodeId) ?? []) {
      const nextCost = current.cost + edge.cost;
      if (nextCost >= (distances.get(edge.to) ?? Infinity)) continue;
      distances.set(edge.to, nextCost);
      heap.push({ nodeId: edge.to, cost: nextCost });
    }
  }

  return distances;
}

async function readCensusFeaturesForDataset(dataset) {
  const source = await shapefile.open(abs(dataset.censusShpPath), abs(dataset.censusDbfPath), {
    encoding: "euc-kr"
  });
  const features = [];
  while (true) {
    const result = await source.read();
    if (result.done) break;
    const geometry4326 = transformGeometry(result.value.geometry, "EPSG:5179", "EPSG:4326");
    const centroid = turf.centroid({
      type: "Feature",
      properties: result.value.properties,
      geometry: geometry4326
    });
    features.push({
      type: "Feature",
      properties: result.value.properties,
      geometry: geometry4326,
      _areaSqm: turf.area(geometry4326),
      _bbox: turf.bbox(geometry4326),
      _centroid: centroid
    });
  }
  return features;
}

async function readAllMetroCensusFeatures() {
  const datasets = [];
  for (const dataset of METRO_DATASETS) {
    const features = await readCensusFeaturesForDataset(dataset);
    datasets.push(...features);
  }
  return datasets;
}

function readAllMetroMetrics() {
  return {
    population: mergeMetricMaps(METRO_DATASETS.map(dataset => readMetricCsv(dataset.populationCsvPath))),
    workers: mergeMetricMaps(METRO_DATASETS.map(dataset => readMetricCsv(dataset.workersCsvPath)))
  };
}

function bboxesOverlap(a, b) {
  return !(a[0] > b[2] || a[2] < b[0] || a[1] > b[3] || a[3] < b[1]);
}

function toStationFeature(node, extraProps = {}) {
  return turf.point([node.lng, node.lat], {
    nodeId: node.id,
    stationName: node.stationName,
    lineName: node.lineName,
    ...extraProps
  });
}

function unionTwo(featureA, featureB) {
  if (!featureA) return featureB;
  if (!featureB) return featureA;
  return turf.union(turf.featureCollection([featureA, featureB]));
}

function toBoundary4326(boundary5186) {
  return {
    type: "Feature",
    properties: boundary5186.properties ?? {},
    geometry: transformGeometry(boundary5186.geometry, "EPSG:5186", "EPSG:4326")
  };
}

function attachMetricProperties(censusFeatures, metrics) {
  for (const feature of censusFeatures) {
    const oaCode = feature.properties.TOT_OA_CD;
    feature.properties.population = metrics.population.get(oaCode) ?? 0;
    feature.properties.workers = metrics.workers.get(oaCode) ?? 0;
  }
}

function createGridKey(lng, lat, step) {
  return `${Math.floor(lng / step)}:${Math.floor(lat / step)}`;
}

function buildCentroidGridIndex(censusFeatures, step = 0.01) {
  const grid = new Map();
  censusFeatures.forEach((feature, index) => {
    const [lng, lat] = feature._centroid.geometry.coordinates;
    const key = createGridKey(lng, lat, step);
    const bucket = grid.get(key) ?? [];
    bucket.push(index);
    grid.set(key, bucket);
  });
  return { step, grid };
}

function collectCandidateIndexes(index, bbox) {
  const [minX, minY, maxX, maxY] = bbox;
  const minCol = Math.floor(minX / index.step);
  const maxCol = Math.floor(maxX / index.step);
  const minRow = Math.floor(minY / index.step);
  const maxRow = Math.floor(maxY / index.step);
  const candidates = new Set();

  for (let col = minCol; col <= maxCol; col += 1) {
    for (let row = minRow; row <= maxRow; row += 1) {
      const bucket = index.grid.get(`${col}:${row}`);
      if (!bucket) continue;
      bucket.forEach(item => candidates.add(item));
    }
  }
  return [...candidates];
}

function assignMinimumTravelMinutes(censusFeatures, stationBuffers) {
  const centroidIndex = buildCentroidGridIndex(censusFeatures);
  const minTravelMinutes = new Array(censusFeatures.length).fill(Infinity);

  for (const stationBuffer of stationBuffers) {
    const bbox = turf.bbox(stationBuffer.bufferFeature);
    const candidateIndexes = collectCandidateIndexes(centroidIndex, bbox);
    for (const featureIndex of candidateIndexes) {
      if (stationBuffer.travelMinutes >= minTravelMinutes[featureIndex]) continue;
      const centroid = censusFeatures[featureIndex]._centroid;
      if (!turf.booleanPointInPolygon(centroid, stationBuffer.bufferFeature)) continue;
      minTravelMinutes[featureIndex] = stationBuffer.travelMinutes;
    }
  }

  return minTravelMinutes;
}

function summarizeReachableMetrics(censusFeatures, minTravelMinutes, threshold) {
  let totalPopulation = 0;
  let totalWorkers = 0;

  for (let i = 0; i < censusFeatures.length; i += 1) {
    if (!(minTravelMinutes[i] <= threshold)) continue;
    const feature = censusFeatures[i];
    totalPopulation += feature.properties.population;
    totalWorkers += feature.properties.workers;
  }

  return {
    totalPopulation,
    totalWorkers
  };
}

function buildOaSummaryRows(censusFeatures, minTravelMinutes) {
  return censusFeatures.map((feature, index) => {
    const minute = minTravelMinutes[index];
    return {
      oaCode: feature.properties.TOT_OA_CD,
      population: feature.properties.population,
      workers: feature.properties.workers,
      minTravelMinutes: Number.isFinite(minute) ? round(minute) : "",
      coverage30: minute <= 30 ? 1 : 0,
      coverage60: minute <= 60 ? 1 : 0
    };
  });
}

function computeStationAreaRatios(boundary4326, activeNodes) {
  const boundaryAreaSqm = turf.area(boundary4326);
  const results = [];

  for (const radius of STATION_AREA_BUFFERS_M) {
    let union = null;
    for (const node of activeNodes) {
      const buffer = turf.buffer(toStationFeature(node), radius, { units: "meters" });
      const intersection = turf.intersect(turf.featureCollection([buffer, boundary4326]));
      if (!intersection) continue;
      union = unionTwo(union, intersection);
    }
    const coveredAreaSqm = union ? turf.area(union) : 0;
    results.push({
      bufferMeters: radius,
      coveredAreaSqm,
      areaRatio: boundaryAreaSqm ? coveredAreaSqm / boundaryAreaSqm : 0
    });
  }

  return results;
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : value;
}

function buildStationBuffers(reachableStations) {
  return reachableStations.map(station => ({
    ...station,
    bufferFeature: turf.buffer(station.feature, STATION_CATCHMENT_M, { units: "meters" })
  }));
}

function buildMinutePolygons(bufferRecords) {
  const sorted = [...bufferRecords].sort((a, b) => a.travelMinutes - b.travelMinutes);
  const minutePolygons = new Map();
  let currentUnion = null;
  let cursor = 0;

  for (let minute = 0; minute <= CURVE_MAX_MIN; minute += 1) {
    while (cursor < sorted.length && sorted[cursor].travelMinutes <= minute) {
      currentUnion = unionTwo(currentUnion, sorted[cursor].bufferFeature);
      cursor += 1;
    }
    minutePolygons.set(minute, currentUnion);
  }

  return minutePolygons;
}

function buildCurveRows(censusFeatures, minTravelMinutes) {
  const rows = [];
  for (let minute = 0; minute <= CURVE_MAX_MIN; minute += 1) {
    const totals = summarizeReachableMetrics(censusFeatures, minTravelMinutes, minute);
    rows.push({
      minute,
      reachablePopulation: totals.totalPopulation,
      reachableWorkers: totals.totalWorkers
    });
  }
  return rows;
}

async function analyzeSite(config, coreStationConfig, activeNodes, adjacency, censusFeatures, metrics) {
  const boundary4326 = toBoundary4326(readJson(config.boundaryPath));

  const originNodes = activeNodes.filter(node => node.stationName === coreStationConfig.coreStationName);
  if (!originNodes.length) {
    throw new Error(`Core station not found: ${coreStationConfig.coreStationName}`);
  }

  const travelSeconds = dijkstra(adjacency, originNodes.map(node => node.id));
  const reachableStations = activeNodes
    .map(node => ({
      ...node,
      nodeId: node.id,
      travelSeconds: travelSeconds.get(node.id) ?? Infinity,
      travelMinutes: (travelSeconds.get(node.id) ?? Infinity) / 60,
      feature: toStationFeature(node)
    }))
    .filter(node => Number.isFinite(node.travelMinutes) && node.travelMinutes <= CURVE_MAX_MIN)
    .sort((a, b) => a.travelMinutes - b.travelMinutes);

  const stationBuffers = buildStationBuffers(reachableStations);
  const minutePolygons = buildMinutePolygons(stationBuffers);
  const minTravelMinutes = assignMinimumTravelMinutes(censusFeatures, stationBuffers);
  const polygon30 = minutePolygons.get(30) ?? null;
  const polygon60 = minutePolygons.get(60) ?? null;
  const cumulativeCurve = buildCurveRows(censusFeatures, minTravelMinutes);
  const totals30 = summarizeReachableMetrics(censusFeatures, minTravelMinutes, 30);
  const totals60 = summarizeReachableMetrics(censusFeatures, minTravelMinutes, 60);
  const oaSummaryRows = buildOaSummaryRows(censusFeatures, minTravelMinutes);

  const thresholdSummaries = [
    {
      thresholdMinutes: 30,
      reachableStationCount: reachableStations.filter(station => station.travelMinutes <= 30).length,
      isochroneAreaSqm: polygon30 ? turf.area(polygon30) : 0,
      reachablePopulation: totals30.totalPopulation,
      reachableWorkers: totals30.totalWorkers,
      reachableBusiness: 0
    },
    {
      thresholdMinutes: 60,
      reachableStationCount: reachableStations.filter(station => station.travelMinutes <= 60).length,
      isochroneAreaSqm: polygon60 ? turf.area(polygon60) : 0,
      reachablePopulation: totals60.totalPopulation,
      reachableWorkers: totals60.totalWorkers,
      reachableBusiness: 0
    }
  ];

  writeJson(
    `data/processed/transport/${config.siteId}_isochrone_30m.geojson`,
    polygon30 ?? turf.featureCollection([])
  );
  writeJson(
    `data/processed/transport/${config.siteId}_isochrone_60m.geojson`,
    polygon60 ?? turf.featureCollection([])
  );

  const stationAreaRatios = computeStationAreaRatios(boundary4326, activeNodes);
  const reachableStationRows = reachableStations.map(station => ({
    nodeId: station.nodeId,
    stationName: station.stationName,
    lineName: station.lineName,
    travelMinutes: round(station.travelMinutes),
    lng: station.lng,
    lat: station.lat
  }));

  const summary = {
    analysisDate: ANALYSIS_DATE,
    siteId: config.siteId,
    siteName: config.siteName,
    sourceCoverage: "서울특별시 + 인천광역시 + 경기도 집계구 전체",
    coreStation: {
      stationName: coreStationConfig.displayStationName,
      stationNodeRule: coreStationConfig.stationNodeRule,
      justification: coreStationConfig.justification,
      originNodeCount: originNodes.length,
      originLines: [...new Set(originNodes.map(node => node.lineName))]
    },
    isochrones: thresholdSummaries,
    cumulativeCurveMinuteRange: [0, CURVE_MAX_MIN],
    stationCatchmentMeters: STATION_CATCHMENT_M,
    stationAreaRatios
  };

  writeJson(`data/processed/transport/${config.siteId}_transport_summary.json`, summary);
  writeCsv(`data/processed/transport/${config.siteId}_reachable_stations.csv`, reachableStationRows);
  writeCsv(`data/processed/transport/${config.siteId}_station_oa_overlap.csv`, []);
  writeCsv(`data/processed/transport/${config.siteId}_oa_access_summary.csv`, oaSummaryRows);
  writeCsv(`data/processed/transport/${config.siteId}_cumulative_access_curve.csv`, cumulativeCurve);

  return summary;
}

async function main() {
  ensureDir("data/processed/transport");

  const coreStations = readJson("data/raw/transport/core_stations.json");
  const coreStationBySite = new Map(coreStations.map(item => [item.siteId, item]));
  const activeNodes = readNodes();
  const links = readLinks();
  const adjacency = buildAdjacency(activeNodes, links);

  const censusFeatures = await readAllMetroCensusFeatures();
  const metrics = readAllMetroMetrics();
  attachMetricProperties(censusFeatures, metrics);

  const siteResults = [];
  for (const config of siteConfigs) {
    const coreStationConfig = coreStationBySite.get(config.siteId);
    if (!coreStationConfig) throw new Error(`Missing core station config for ${config.siteId}`);
    const summary = await analyzeSite(
      config,
      coreStationConfig,
      activeNodes,
      adjacency,
      censusFeatures,
      metrics
    );
    siteResults.push(summary);
  }

  writeJson("data/processed/transport/core_stations_used.json", {
    analysisDate: ANALYSIS_DATE,
    stations: coreStations
  });
  writeJson("data/processed/transport/transport_comparison_summary.json", {
    analysisDate: ANALYSIS_DATE,
    stationCatchmentMeters: STATION_CATCHMENT_M,
    sourceCoverage: "서울특별시 + 인천광역시 + 경기도 집계구 전체",
    sites: siteResults
  });

  console.log(`transport analysis complete (${ANALYSIS_DATE})`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
