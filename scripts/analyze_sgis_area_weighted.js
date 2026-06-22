const fs = require("fs");
const path = require("path");
const proj4 = require("proj4");
const shapefile = require("shapefile");
const turf = require("@turf/turf");

const baseDir = path.resolve(__dirname, "..");

proj4.defs(
  "EPSG:5179",
  "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs"
);
proj4.defs(
  "EPSG:5186",
  "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs"
);

const configs = [
  {
    siteId: "pangyo",
    siteName: "Pangyo Urban Support Only",
    boundaryPath: "data/raw/boundary/pangyo_urban_support_only.geojson",
    censusShpPath: "data/raw/sgis/census_boundary/bundang_2025_2Q/bnd_oa_31023_2025_2Q.shp",
    censusDbfPath: "data/raw/sgis/census_boundary/bundang_2025_2Q/bnd_oa_31023_2025_2Q.dbf",
    populationCsvPath: "data/raw/sgis/population/bundang_population.csv",
    businessCsvPath: "data/raw/sgis/business/bundang_business.csv",
    workersCsvPath: "data/raw/sgis/workers/bundang_workers.csv",
    outputBase: "pangyo_sgis_area_weighted"
  },
  {
    siteId: "okjeong",
    siteName: "Okjeong Urban Support Only",
    boundaryPath: "data/raw/boundary/okjeong_urban_support_only.geojson",
    censusShpPath: "data/raw/sgis/census_boundary/yangju_2025_2Q/bnd_oa_31260_2025_2Q.shp",
    censusDbfPath: "data/raw/sgis/census_boundary/yangju_2025_2Q/bnd_oa_31260_2025_2Q.dbf",
    populationCsvPath: "data/raw/sgis/population/yangju_population.csv",
    businessCsvPath: "data/raw/sgis/business/yangju_business.csv",
    workersCsvPath: "data/raw/sgis/workers/yangju_workers.csv",
    outputBase: "okjeong_sgis_area_weighted"
  }
];

function abs(relativePath) {
  return path.join(baseDir, relativePath);
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
    ...rows.map(row => headers.map(h => csvEscape(row[h])).join(","))
  ];
  fs.writeFileSync(abs(relativePath), lines.join("\n"), "utf8");
}

function readSimpleCsv(relativePath) {
  return fs.readFileSync(abs(relativePath), "utf8")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(","));
}

function parseMetricCsv(relativePath) {
  const rows = readSimpleCsv(relativePath);
  const map = new Map();
  let naCount = 0;
  for (const row of rows) {
    const oaCode = row[1];
    const raw = row[3];
    let value = 0;
    let isMissing = false;
    if (raw == null || raw === "" || raw === "N/A") {
      isMissing = true;
      naCount += 1;
    } else {
      const parsed = Number(String(raw).replace(/,/g, ""));
      value = Number.isFinite(parsed) ? parsed : 0;
    }
    map.set(oaCode, { value, isMissing });
  }
  return { map, naCount };
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

function ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function planarArea(geometry) {
  if (!geometry) return 0;
  if (geometry.type === "Polygon") {
    return Math.max(
      0,
      ringArea(geometry.coordinates[0]) -
        geometry.coordinates.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0)
    );
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce(
      (sum, polygon) =>
        sum +
        Math.max(
          0,
          ringArea(polygon[0]) - polygon.slice(1).reduce((inner, ring) => inner + ringArea(ring), 0)
        ),
      0
    );
  }
  return 0;
}

async function readCensusFeatures(config) {
  const source = await shapefile.open(abs(config.censusShpPath), abs(config.censusDbfPath), {
    encoding: "euc-kr"
  });
  const features = [];
  while (true) {
    const result = await source.read();
    if (result.done) break;
    features.push(result.value);
  }
  return features;
}

function intersectsAndWeightedRows(boundary5179, censusFeatures, metrics) {
  const rows = [];
  const boundaryAreaSqm = planarArea(boundary5179.geometry);
  let totalPopulation = 0;
  let totalBusiness = 0;
  let totalWorkers = 0;
  let missingBusinessCells = 0;
  let missingWorkersCells = 0;

  for (const feature of censusFeatures) {
    const oaCode = feature.properties.TOT_OA_CD;
    const censusAreaSqm = planarArea(feature.geometry);
    if (!censusAreaSqm) continue;

    const intersection = turf.intersect(
      turf.featureCollection([boundary5179, feature])
    );
    if (!intersection) continue;

    const intersectionAreaSqm = planarArea(intersection.geometry);
    if (!intersectionAreaSqm) continue;
    const areaRatio = intersectionAreaSqm / censusAreaSqm;

    const popMetric = metrics.population.map.get(oaCode) ?? { value: 0, isMissing: true };
    const bizMetric = metrics.business.map.get(oaCode) ?? { value: 0, isMissing: true };
    const workerMetric = metrics.workers.map.get(oaCode) ?? { value: 0, isMissing: true };

    if (bizMetric.isMissing) missingBusinessCells += 1;
    if (workerMetric.isMissing) missingWorkersCells += 1;

    const populationWeighted = popMetric.value * areaRatio;
    const businessWeighted = bizMetric.value * areaRatio;
    const workersWeighted = workerMetric.value * areaRatio;

    totalPopulation += populationWeighted;
    totalBusiness += businessWeighted;
    totalWorkers += workersWeighted;

    rows.push({
      oaCode,
      censusAreaSqm,
      intersectionAreaSqm,
      areaRatio,
      population: popMetric.value,
      business: bizMetric.value,
      workers: workerMetric.value,
      populationWeighted,
      businessWeighted,
      workersWeighted,
      businessMissing: bizMetric.isMissing ? 1 : 0,
      workersMissing: workerMetric.isMissing ? 1 : 0
    });
  }

  return {
    rows,
    summary: {
      boundaryAreaSqm,
      totalPopulation,
      totalBusiness,
      totalWorkers,
      populationDensityPerSqKm: boundaryAreaSqm ? totalPopulation / (boundaryAreaSqm / 1_000_000) : null,
      businessDensityPerSqKm: boundaryAreaSqm ? totalBusiness / (boundaryAreaSqm / 1_000_000) : null,
      workersDensityPerSqKm: boundaryAreaSqm ? totalWorkers / (boundaryAreaSqm / 1_000_000) : null,
      intersectedOaCount: rows.length,
      missingBusinessCells,
      missingWorkersCells
    }
  };
}

async function analyze(config) {
  const boundary5186 = readJson(config.boundaryPath);
  const boundary5179 = {
    type: "Feature",
    properties: boundary5186.properties ?? {},
    geometry: transformGeometry(boundary5186.geometry, "EPSG:5186", "EPSG:5179")
  };

  const censusRaw = await readCensusFeatures(config);
  const censusFeatures = censusRaw.map(feature => ({
    type: "Feature",
    properties: feature.properties,
    geometry: feature.geometry
  }));

  const metrics = {
    population: parseMetricCsv(config.populationCsvPath),
    business: parseMetricCsv(config.businessCsvPath),
    workers: parseMetricCsv(config.workersCsvPath)
  };

  const result = intersectsAndWeightedRows(boundary5179, censusFeatures, metrics);

  writeCsv(`data/processed/${config.outputBase}_cells.csv`, result.rows);
  writeJson(`data/processed/${config.outputBase}_summary.json`, {
    siteId: config.siteId,
    siteName: config.siteName,
    ...result.summary,
    sourceMissingCounts: {
      businessNaRows: metrics.business.naCount,
      workersNaRows: metrics.workers.naCount
    }
  });

  console.log(
    config.siteId,
    JSON.stringify({
      intersectedOaCount: result.summary.intersectedOaCount,
      totalPopulation: result.summary.totalPopulation,
      totalBusiness: result.summary.totalBusiness,
      totalWorkers: result.summary.totalWorkers
    })
  );
}

(async () => {
  for (const config of configs) {
    await analyze(config);
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
