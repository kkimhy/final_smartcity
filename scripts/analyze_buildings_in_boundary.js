const fs = require("fs");
const path = require("path");
const shapefile = require("shapefile");
const proj4 = require("proj4");
const iconv = require("iconv-lite");
const { parse } = require("csv-parse/sync");
const turf = require("@turf/turf");

const baseDir = path.resolve(__dirname, "..");

proj4.defs(
  "EPSG:5174",
  "+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-146.43,507.89,681.46 +units=m +no_defs"
);
proj4.defs(
  "EPSG:5186",
  "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs"
);
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

const configs = [
  {
    siteId: "pangyo",
    siteName: "Pangyo Urban Support Only",
    boundaryPath: "data/raw/boundary/pangyo_urban_support_only.geojson",
    buildingCsvPath: "data/raw/building/seongnam_bundang_building.csv",
    parcelShpPath:
      "판교테크노벨리/LSMD_CONT_LDREG_5174_경기_성남시_분당구/LSMD_CONT_LDREG_5174_41135_202606.shp",
    parcelDbfPath:
      "판교테크노벨리/LSMD_CONT_LDREG_5174_경기_성남시_분당구/LSMD_CONT_LDREG_5174_41135_202606.dbf",
    parcelCrs: "EPSG:5174",
    outputBase: "pangyo_buildings_in_boundary"
  },
  {
    siteId: "okjeong",
    siteName: "Okjeong Urban Support Only",
    boundaryPath: "data/raw/boundary/okjeong_urban_support_only.geojson",
    buildingCsvPath: "data/raw/building/yangju_building.csv",
    parcelShpPath:
      "양주옥정신도시/LSMD_CONT_LDREG_경기_양주시/LSMD_CONT_LDREG_41630_202606.shp",
    parcelDbfPath:
      "양주옥정신도시/LSMD_CONT_LDREG_경기_양주시/LSMD_CONT_LDREG_41630_202606.dbf",
    parcelCrs: "EPSG:5186",
    outputBase: "okjeong_buildings_in_boundary"
  }
];

function abs(relativePath) {
  return path.join(baseDir, relativePath);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(abs(relativePath), "utf8"));
}

function readCsvCp949(relativePath) {
  const buffer = fs.readFileSync(abs(relativePath));
  const text = buffer.slice(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
    ? buffer.toString("utf8")
    : iconv.decode(buffer, "cp949");
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true
  });
}

function writeJson(relativePath, value) {
  fs.writeFileSync(abs(relativePath), JSON.stringify(value, null, 2), "utf8");
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
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

function normalizeNumberText(value, pad) {
  const raw = (value ?? "").toString().trim();
  if (!raw) return "".padStart(pad, "0");
  const cleaned = raw.replace(/[^\d]/g, "");
  return cleaned.padStart(pad, "0");
}

function buildPnu(row) {
  const sgg = normalizeNumberText(row["시군구코드"], 5);
  const bjd = normalizeNumberText(row["법정동코드"], 5);
  const landType = String(Number((row["대지구분코드"] ?? "0").toString().trim() || "0") + 1);
  const bun = normalizeNumberText(row["번"], 4);
  const ji = normalizeNumberText(row["지"], 4);
  return `${sgg}${bjd}${landType}${bun}${ji}`;
}

function buildPnuCandidates(row) {
  const sgg = normalizeNumberText(row["시군구코드"], 5);
  const bjd = normalizeNumberText(row["법정동코드"], 5);
  const bun = normalizeNumberText(row["번"], 4);
  const ji = normalizeNumberText(row["지"], 4);
  const base = `${sgg}${bjd}`;
  return [
    `${base}0${bun}${ji}`,
    `${base}1${bun}${ji}`,
    `${base}2${bun}${ji}`
  ];
}

function transformCoords(coords, fromCrs, toCrs) {
  if (typeof coords[0] === "number") {
    return proj4(fromCrs, toCrs, coords);
  }
  return coords.map(part => transformCoords(part, fromCrs, toCrs));
}

function transformGeometry(geometry, fromCrs, toCrs) {
  return {
    ...geometry,
    coordinates: transformCoords(geometry.coordinates, fromCrs, toCrs)
  };
}

async function readParcels(config) {
  const source = await shapefile.open(abs(config.parcelShpPath), abs(config.parcelDbfPath), {
    encoding: "euc-kr"
  });
  const parcels = new Map();
  while (true) {
    const result = await source.read();
    if (result.done) break;
    const feature = result.value;
    const pnu = feature.properties.PNU;
    if (!pnu) continue;
    const transformed = {
      type: "Feature",
      properties: feature.properties,
      geometry: transformGeometry(feature.geometry, config.parcelCrs, "EPSG:4326")
    };
    parcels.set(pnu, transformed);
  }
  return parcels;
}

function parseNumeric(value) {
  if (value == null || value === "") return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseYear(value) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  if (digits.length < 4) return null;
  const year = Number(digits.slice(0, 4));
  if (year < 1900 || year > 2100) return null;
  return year;
}

function countBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row) ?? "UNKNOWN";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "ko"))
    .map(([key, count]) => ({ key, count }));
}

function summarize(rows, config) {
  const grossAreas = rows
    .map(row => parseNumeric(row.grossFloorAreaSqm))
    .filter(value => value != null);
  const totalGrossArea = grossAreas.reduce((sum, value) => sum + value, 0);
  const averageGrossArea = grossAreas.length ? totalGrossArea / grossAreas.length : null;

  return {
    siteId: config.siteId,
    siteName: config.siteName,
    buildingCount: rows.length,
    grossAreaSumSqm: totalGrossArea,
    averageGrossAreaSqm: averageGrossArea,
    primaryUseDistribution: countBy(rows, row => row.mainUse),
    approvalYearDistribution: countBy(rows, row => row.approvalYear || null)
  };
}

function makeExportRow(row, pnu, parcelFeature, centroidFeature) {
  return {
    pnu,
    managementPk: row["관리건축물대장PK"],
    siteAddress: row["대지위치"],
    roadAddress: row["도로명대지위치"],
    mainUse: row["주용도코드명"],
    grossFloorAreaSqm: row["연면적(㎡)"],
    approvalDate: row["사용승인일"],
    approvalYear: parseYear(row["사용승인일"]) ?? "",
    parcelJibun: parcelFeature.properties.JIBUN ?? "",
    centroidLon: centroidFeature.geometry.coordinates[0],
    centroidLat: centroidFeature.geometry.coordinates[1]
  };
}

async function analyze(config) {
  const boundary = readJson(config.boundaryPath);
  const boundary4326 = {
    type: "Feature",
    properties: boundary.properties ?? {},
    geometry: transformGeometry(boundary.geometry, "EPSG:5186", "EPSG:4326")
  };
  const parcels = await readParcels(config);
  const buildings = readCsvCp949(config.buildingCsvPath);

  const joined = [];
  let parcelMatched = 0;
  let insideCount = 0;

  for (const row of buildings) {
    const pnu = buildPnu(row);
    const parcelFeature = parcels.get(pnu);
    if (!parcelFeature) continue;
    parcelMatched += 1;
    const centroid = turf.centroid(parcelFeature);
    if (!turf.booleanPointInPolygon(centroid, boundary4326)) continue;
    insideCount += 1;
    joined.push(makeExportRow(row, pnu, parcelFeature, centroid));
  }

  const summary = summarize(joined, config);
  summary.totalBuildingLedgerRows = buildings.length;
  summary.parcelMatchedRows = parcelMatched;
  summary.insideBoundaryRows = insideCount;
  summary.parcelMatchRate = buildings.length ? parcelMatched / buildings.length : null;

  writeJson(`data/processed/${config.outputBase}_summary.json`, summary);
  writeCsv(`data/processed/${config.outputBase}.csv`, joined);
  const samples = buildings.slice(0, 5).map(row => {
    const candidates = buildPnuCandidates(row);
    return {
      address: row["대지위치"],
      generatedPnu: buildPnu(row),
      candidateHits: candidates.filter(candidate => parcels.has(candidate))
    };
  });
  console.log(config.siteId, JSON.stringify({
    total: buildings.length,
    matched: parcelMatched,
    inside: insideCount,
    samples
  }));
}

(async () => {
  for (const config of configs) {
    await analyze(config);
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
