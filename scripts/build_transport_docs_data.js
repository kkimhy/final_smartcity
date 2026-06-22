const fs = require("fs");
const path = require("path");
const shapefile = require("shapefile");
const proj4 = require("proj4");
const turf = require("@turf/turf");

const baseDir = path.resolve(__dirname, "..");

proj4.defs(
  "EPSG:5179",
  "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs"
);
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

const METRO_CONTEXT_SHAPEFILES = [
  {
    shpPath: "bnd_oa_11_2025_2Q/bnd_oa_11_2025_2Q.shp",
    dbfPath: "bnd_oa_11_2025_2Q/bnd_oa_11_2025_2Q.dbf"
  },
  {
    shpPath: "bnd_oa_23_2025_2Q/bnd_oa_23_2025_2Q.shp",
    dbfPath: "bnd_oa_23_2025_2Q/bnd_oa_23_2025_2Q.dbf"
  },
  {
    shpPath: "bnd_oa_31_2025_2Q/bnd_oa_31_2025_2Q.shp",
    dbfPath: "bnd_oa_31_2025_2Q/bnd_oa_31_2025_2Q.dbf"
  }
];

function abs(relativePath) {
  return path.join(baseDir, relativePath);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(abs(relativePath), "utf8"));
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

function bboxPad(bbox, pad) {
  return [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad];
}

function bboxesOverlap(a, b) {
  return !(a[0] > b[2] || a[2] < b[0] || a[1] > b[3] || a[3] < b[1]);
}

async function buildContextPolygons(isochroneGeojson, limit = 900) {
  const targetBbox = bboxPad(turf.bbox(isochroneGeojson), 0.02);
  const features = [];

  for (const dataset of METRO_CONTEXT_SHAPEFILES) {
    const source = await shapefile.open(abs(dataset.shpPath), abs(dataset.dbfPath), {
      encoding: "euc-kr"
    });

    while (true) {
      const result = await source.read();
      if (result.done) break;
      const geometry4326 = transformGeometry(result.value.geometry, "EPSG:5179", "EPSG:4326");
      const feature = {
        type: "Feature",
        properties: {
          oaCode: result.value.properties.TOT_OA_CD
        },
        geometry: geometry4326
      };
      const bbox = turf.bbox(feature);
      if (!bboxesOverlap(targetBbox, bbox)) continue;

      const simplified = turf.simplify(feature, {
        tolerance: 0.00018,
        highQuality: false,
        mutate: false
      });
      features.push(simplified);
      if (features.length >= limit) return features;
    }
  }

  return features;
}

function readCsv(relativePath) {
  const [headerLine, ...lines] = fs.readFileSync(abs(relativePath), "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  const headers = headerLine.split(",");
  return lines.map(line => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function toNumberRows(rows, numericKeys) {
  return rows.map(row => {
    const next = { ...row };
    for (const key of numericKeys) {
      next[key] = Number(row[key] ?? 0);
    }
    return next;
  });
}

async function buildSite(siteId) {
  const isochrone30 = readJson(`data/processed/transport/${siteId}_isochrone_30m.geojson`);
  const isochrone60 = readJson(`data/processed/transport/${siteId}_isochrone_60m.geojson`);
  return {
    summary: readJson(`data/processed/transport/${siteId}_transport_summary.json`),
    cumulativeCurve: toNumberRows(
      readCsv(`data/processed/transport/${siteId}_cumulative_access_curve.csv`),
      ["minute", "reachablePopulation", "reachableWorkers"]
    ),
    oaAccessSummary: toNumberRows(
      readCsv(`data/processed/transport/${siteId}_oa_access_summary.csv`),
      ["population", "workers", "minTravelMinutes", "coverage30", "coverage60"]
    ),
    reachableStations: toNumberRows(
      readCsv(`data/processed/transport/${siteId}_reachable_stations.csv`),
      ["nodeId", "travelMinutes", "lng", "lat"]
    ),
    isochrone30,
    isochrone60,
    contextPolygons: await buildContextPolygons(isochrone60)
  };
}

async function main() {
  const transportSummary = readJson("data/processed/transport/transport_comparison_summary.json");
  const data = {
    comparisonSummary: transportSummary,
    methods: {
      analysisDate: transportSummary.analysisDate,
      stationCatchmentMeters: transportSummary.stationCatchmentMeters,
      isochroneDefinition: "핵심역에서 지하철 최단시간으로 도달 가능한 역들의 500m 역세권 union",
      metricDefinition: "서울·인천·경기 전체 집계구의 centroid가 해당 시간대 역세권 안에 들어오면 해당 집계구 인구·종사자를 접근 가능 인원으로 집계",
      currentLimitation: "현재 수치는 수도권 전체를 기준으로 다시 계산했지만, 집계구 centroid 기반 접근 판정이므로 집계구 일부만 버퍼에 걸치는 경우는 반영되지 않는다."
    },
    sites: {
      pangyo: await buildSite("pangyo"),
      okjeong: await buildSite("okjeong")
    }
  };

  fs.writeFileSync(
    abs("docs/data/transport-data.js"),
    `window.TRANSPORT_DATA = ${JSON.stringify(data)};\n`,
    "utf8"
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
