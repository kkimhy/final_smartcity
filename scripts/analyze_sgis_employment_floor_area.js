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
  "EPSG:5179",
  "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs"
);
proj4.defs(
  "EPSG:5186",
  "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs"
);
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

const EMPLOYMENT_USES = new Set([
  "업무시설",
  "교육연구시설",
  "공장",
  "창고시설",
  "자동차관련시설"
]);

const configs = [
  {
    siteId: "pangyo",
    siteName: "Pangyo Urban Support Only",
    regionKeyword: "판교",
    parcelCode: "41135",
    parcelCrs: "EPSG:5174",
    boundaryPath: "data/raw/boundary/pangyo_urban_support_only.geojson",
    buildingCsvPath: "data/raw/building/seongnam_bundang_building.csv",
    censusShpPath: "data/raw/sgis/census_boundary/bundang_2025_2Q/bnd_oa_31023_2025_2Q.shp",
    censusDbfPath: "data/raw/sgis/census_boundary/bundang_2025_2Q/bnd_oa_31023_2025_2Q.dbf",
    businessCsvPath: "data/raw/sgis/business/bundang_business.csv",
    workersCsvPath: "data/raw/sgis/workers/bundang_workers.csv",
    areaSummaryPath: "data/processed/pangyo_sgis_area_weighted_summary.json",
    outputBase: "pangyo_sgis_floor_area_weighted"
  },
  {
    siteId: "okjeong",
    siteName: "Okjeong Urban Support Only",
    regionKeyword: "양주",
    parcelCode: "41630",
    parcelCrs: "EPSG:5186",
    boundaryPath: "data/raw/boundary/okjeong_urban_support_only.geojson",
    buildingCsvPath: "data/raw/building/yangju_building.csv",
    censusShpPath: "data/raw/sgis/census_boundary/yangju_2025_2Q/bnd_oa_31260_2025_2Q.shp",
    censusDbfPath: "data/raw/sgis/census_boundary/yangju_2025_2Q/bnd_oa_31260_2025_2Q.dbf",
    businessCsvPath: "data/raw/sgis/business/yangju_business.csv",
    workersCsvPath: "data/raw/sgis/workers/yangju_workers.csv",
    areaSummaryPath: "data/processed/okjeong_sgis_area_weighted_summary.json",
    outputBase: "okjeong_sgis_floor_area_weighted"
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

function readUtfAwareCsv(relativePath) {
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
  for (const row of rows) {
    const oaCode = row[1];
    const raw = row[3];
    map.set(oaCode, raw == null || raw === "" || raw === "N/A"
      ? { value: 0, isMissing: true }
      : { value: Number(String(raw).replace(/,/g, "")) || 0, isMissing: false });
  }
  return map;
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

function parseNumeric(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
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

function findParcelShapefile(config) {
  const rootEntries = fs.readdirSync(baseDir, { withFileTypes: true });
  const regionDirEntry = rootEntries.find(entry => entry.isDirectory() && entry.name.includes(config.regionKeyword));
  const regionDirName = regionDirEntry && regionDirEntry.name;
  if (!regionDirName) throw new Error(`Region dir not found for ${config.siteId}`);
  const regionDir = path.join(baseDir, regionDirName);
  const lsmdDirName = fs.readdirSync(regionDir).find(name => name.startsWith("LSMD_CONT_LDREG"));
  if (!lsmdDirName) throw new Error(`LSMD dir not found for ${config.siteId}`);
  const lsmdDir = path.join(regionDir, lsmdDirName);
  const shpName = fs.readdirSync(lsmdDir).find(name => name.endsWith(".shp") && name.includes(config.parcelCode));
  if (!shpName) throw new Error(`Parcel shp not found for ${config.siteId}`);
  return {
    shpPath: path.join(lsmdDir, shpName),
    dbfPath: path.join(lsmdDir, shpName.replace(/\.shp$/i, ".dbf"))
  };
}

async function readParcelCentroids(config) {
  const { shpPath, dbfPath } = findParcelShapefile(config);
  const source = await shapefile.open(shpPath, dbfPath, { encoding: "euc-kr" });
  const parcels = new Map();
  while (true) {
    const result = await source.read();
    if (result.done) break;
    const feature = result.value;
    const pnu = feature.properties.PNU;
    if (!pnu) continue;
    const geometry4326 = transformGeometry(feature.geometry, config.parcelCrs, "EPSG:4326");
    const centroid = turf.centroid({
      type: "Feature",
      properties: feature.properties,
      geometry: geometry4326
    });
    parcels.set(pnu, {
      pnu,
      centroidLon: centroid.geometry.coordinates[0],
      centroidLat: centroid.geometry.coordinates[1]
    });
  }
  return parcels;
}

async function readCensusFeatures(config) {
  const source = await shapefile.open(abs(config.censusShpPath), abs(config.censusDbfPath), {
    encoding: "euc-kr"
  });
  const features = [];
  while (true) {
    const result = await source.read();
    if (result.done) break;
    const geometry4326 = transformGeometry(result.value.geometry, "EPSG:5179", "EPSG:4326");
    features.push({
      type: "Feature",
      properties: result.value.properties,
      geometry: geometry4326
    });
  }
  return features;
}

function assignOaCode(point, censusFeatures) {
  for (const feature of censusFeatures) {
    if (turf.booleanPointInPolygon(point, feature)) {
      return feature.properties.TOT_OA_CD;
    }
  }
  return null;
}

function buildEmploymentBuildingRows(config, parcels, censusFeatures, boundary4326) {
  const rows = readUtfAwareCsv(config.buildingCsvPath);
  const out = [];

  for (const row of rows) {
    const mainUse = row["주용도코드명"];
    if (!EMPLOYMENT_USES.has(mainUse)) continue;
    const gross = parseNumeric(row["연면적(㎡)"]);
    if (!gross || gross <= 0) continue;

    const pnu = buildPnu(row);
    const parcel = parcels.get(pnu);
    if (!parcel) continue;

    const point = turf.point([parcel.centroidLon, parcel.centroidLat]);
    const oaCode = assignOaCode(point, censusFeatures);
    if (!oaCode) continue;
    const insideBoundary = turf.booleanPointInPolygon(point, boundary4326);

    out.push({
      pnu,
      oaCode,
      mainUse,
      grossFloorAreaSqm: gross,
      insideBoundary: insideBoundary ? 1 : 0,
      approvalDate: row["사용승인일"] || "",
      siteAddress: row["대지위치"] || "",
      roadAddress: row["도로명대지위치"] || "",
      centroidLon: parcel.centroidLon,
      centroidLat: parcel.centroidLat
    });
  }

  return out;
}

function summarizeByOa(buildingRows) {
  const map = new Map();
  for (const row of buildingRows) {
    const current = map.get(row.oaCode) ?? {
      oaCode: row.oaCode,
      totalEmploymentFloorAreaSqm: 0,
      insideEmploymentFloorAreaSqm: 0,
      buildingCount: 0,
      insideBuildingCount: 0
    };
    current.totalEmploymentFloorAreaSqm += row.grossFloorAreaSqm;
    current.buildingCount += 1;
    if (row.insideBoundary) {
      current.insideEmploymentFloorAreaSqm += row.grossFloorAreaSqm;
      current.insideBuildingCount += 1;
    }
    map.set(row.oaCode, current);
  }
  return map;
}

function compareWithAreaMethod(config, byOaMap, businessMap, workersMap) {
  const areaSummary = readJson(config.areaSummaryPath);
  const rows = [];
  let floorWeightedBusiness = 0;
  let floorWeightedWorkers = 0;

  for (const [oaCode, stats] of byOaMap.entries()) {
    if (!stats.insideEmploymentFloorAreaSqm || !stats.totalEmploymentFloorAreaSqm) continue;
    const business = businessMap.get(oaCode) ?? { value: 0, isMissing: true };
    const workers = workersMap.get(oaCode) ?? { value: 0, isMissing: true };
    const floorAreaRatio = stats.insideEmploymentFloorAreaSqm / stats.totalEmploymentFloorAreaSqm;
    const businessWeighted = business.value * floorAreaRatio;
    const workersWeighted = workers.value * floorAreaRatio;
    floorWeightedBusiness += businessWeighted;
    floorWeightedWorkers += workersWeighted;
    rows.push({
      oaCode,
      totalEmploymentFloorAreaSqm: stats.totalEmploymentFloorAreaSqm,
      insideEmploymentFloorAreaSqm: stats.insideEmploymentFloorAreaSqm,
      floorAreaRatio,
      business: business.value,
      workers: workers.value,
      businessWeighted,
      workersWeighted,
      businessMissing: business.isMissing ? 1 : 0,
      workersMissing: workers.isMissing ? 1 : 0
    });
  }

  rows.sort((a, b) => a.oaCode.localeCompare(b.oaCode));

  return {
    rows,
    summary: {
      siteId: config.siteId,
      siteName: config.siteName,
      businessFloorWeighted: floorWeightedBusiness,
      workersFloorWeighted: floorWeightedWorkers,
      businessAreaWeighted: areaSummary.totalBusiness,
      workersAreaWeighted: areaSummary.totalWorkers,
      businessDifference: floorWeightedBusiness - areaSummary.totalBusiness,
      workersDifference: floorWeightedWorkers - areaSummary.totalWorkers,
      businessRatioToAreaMethod: areaSummary.totalBusiness ? floorWeightedBusiness / areaSummary.totalBusiness : null,
      workersRatioToAreaMethod: areaSummary.totalWorkers ? floorWeightedWorkers / areaSummary.totalWorkers : null,
      boundaryAreaSqm: areaSummary.boundaryAreaSqm,
      businessDensityFloorWeightedPerSqKm: areaSummary.boundaryAreaSqm ? floorWeightedBusiness / (areaSummary.boundaryAreaSqm / 1_000_000) : null,
      workersDensityFloorWeightedPerSqKm: areaSummary.boundaryAreaSqm ? floorWeightedWorkers / (areaSummary.boundaryAreaSqm / 1_000_000) : null,
      intersectedEmploymentOaCount: rows.length
    }
  };
}

async function analyze(config) {
  const boundary5186 = readJson(config.boundaryPath);
  const boundary4326 = {
    type: "Feature",
    properties: boundary5186.properties ?? {},
    geometry: transformGeometry(boundary5186.geometry, "EPSG:5186", "EPSG:4326")
  };

  const [parcels, censusFeatures] = await Promise.all([
    readParcelCentroids(config),
    readCensusFeatures(config)
  ]);

  const buildingRows = buildEmploymentBuildingRows(config, parcels, censusFeatures, boundary4326);
  const byOaMap = summarizeByOa(buildingRows);
  const businessMap = parseMetricCsv(config.businessCsvPath);
  const workersMap = parseMetricCsv(config.workersCsvPath);
  const result = compareWithAreaMethod(config, byOaMap, businessMap, workersMap);

  writeCsv(`data/processed/${config.outputBase}_buildings.csv`, buildingRows);
  writeCsv(`data/processed/${config.outputBase}_oa.csv`, result.rows);
  writeJson(`data/processed/${config.outputBase}_summary.json`, result.summary);

  console.log(config.siteId, JSON.stringify({
    employmentBuildings: buildingRows.length,
    insideEmploymentBuildings: buildingRows.filter(row => row.insideBoundary).length,
    businessFloorWeighted: result.summary.businessFloorWeighted,
    workersFloorWeighted: result.summary.workersFloorWeighted
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
