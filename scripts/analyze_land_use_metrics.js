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

const STUDY_SITES = [
  {
    siteId: "pangyo",
    siteName: "판교 도시지원시설용지",
    boundaryPath: "data/raw/boundary/pangyo_urban_support_only.geojson",
    buildingCsvPath: "data/raw/building/seongnam_bundang_building.csv",
    parcelShpPath:
      "판교테크노벨리/LSMD_CONT_LDREG_5174_경기_성남시_분당구/LSMD_CONT_LDREG_5174_41135_202606.shp",
    parcelDbfPath:
      "판교테크노벨리/LSMD_CONT_LDREG_5174_경기_성남시_분당구/LSMD_CONT_LDREG_5174_41135_202606.dbf",
    parcelCrs: "EPSG:5174",
    expectedSummaryPath: "data/processed/pangyo_buildings_in_boundary_summary.json"
  },
  {
    siteId: "okjeong",
    siteName: "양주 옥정 자족용지",
    boundaryPath: "data/raw/boundary/okjeong_urban_support_only.geojson",
    buildingCsvPath: "data/raw/building/yangju_building.csv",
    parcelShpPath:
      "양주옥정신도시/LSMD_CONT_LDREG_경기_양주시/LSMD_CONT_LDREG_41630_202606.shp",
    parcelDbfPath:
      "양주옥정신도시/LSMD_CONT_LDREG_경기_양주시/LSMD_CONT_LDREG_41630_202606.dbf",
    parcelCrs: "EPSG:5186",
    expectedSummaryPath: "data/processed/okjeong_buildings_in_boundary_summary.json"
  }
];

const ZONING_LAYER = {
  shpPath: "전국_건축용도지역CH_D024_00_20260618/CH_D024_00_20260618.shp",
  dbfPath: "전국_건축용도지역CH_D024_00_20260618/CH_D024_00_20260618.dbf",
  prjPath: "전국_건축용도지역CH_D024_00_20260618/CH_D024_00_20260618.prj"
};

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
    ...rows.map(row => headers.map(header => csvEscape(row[header])).join(","))
  ];
  fs.writeFileSync(abs(relativePath), lines.join("\n"), "utf8");
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

function normalizeNumberText(value, pad) {
  const raw = (value ?? "").toString().trim();
  if (!raw) return "".padStart(pad, "0");
  const digits = raw.replace(/[^\d]/g, "");
  return digits.padStart(pad, "0");
}

function buildPnu(row) {
  const sgg = normalizeNumberText(row["시군구코드"], 5);
  const bjd = normalizeNumberText(row["법정동코드"], 5);
  const landType = String(Number((row["대지구분코드"] ?? "0").toString().trim() || "0") + 1);
  const bun = normalizeNumberText(row["번"], 4);
  const ji = normalizeNumberText(row["지"], 4);
  return `${sgg}${bjd}${landType}${bun}${ji}`;
}

function parseNumber(value) {
  if (value == null || value === "") return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
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
    return geometry.coordinates.reduce((sum, polygon) => {
      const outer = ringArea(polygon[0]);
      const holes = polygon.slice(1).reduce((inner, ring) => inner + ringArea(ring), 0);
      return sum + Math.max(0, outer - holes);
    }, 0);
  }
  return 0;
}

function geometryBbox(geometry) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function visit(coords) {
    if (typeof coords[0] === "number") {
      const [x, y] = coords;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      return;
    }
    for (const part of coords) visit(part);
  }

  visit(geometry.coordinates);
  return { minX, minY, maxX, maxY };
}

function bboxesOverlap(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

async function readShapefileFeatures(shpPath, dbfPath, encoding = "euc-kr") {
  const source = await shapefile.open(abs(shpPath), abs(dbfPath), { encoding });
  const features = [];
  while (true) {
    const result = await source.read();
    if (result.done) break;
    features.push(result.value);
  }
  return features;
}

async function readParcels(config) {
  const features = await readShapefileFeatures(config.parcelShpPath, config.parcelDbfPath);
  return features.map(feature => ({
    pnu: feature.properties.PNU,
    jibun: feature.properties.JIBUN ?? "",
    geometry5186: config.parcelCrs === "EPSG:5186"
      ? feature.geometry
      : transformGeometry(feature.geometry, config.parcelCrs, "EPSG:5186")
  }));
}

function featureFromGeometry(geometry, properties = {}) {
  return {
    type: "Feature",
    properties,
    geometry
  };
}

function computeEntropy(shares, categoryCount) {
  const positiveShares = shares.filter(share => share > 0);
  const entropy = positiveShares.reduce((sum, share) => sum - share * Math.log(share), 0);
  const normalized = categoryCount > 1 ? entropy / Math.log(categoryCount) : 0;
  return { entropy, normalized };
}

function round(value, digits = 6) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function assessZoningLayer(boundaryBySite) {
  const features = await readShapefileFeatures(ZONING_LAYER.shpPath, ZONING_LAYER.dbfPath);
  const prj = fs.readFileSync(abs(ZONING_LAYER.prjPath), "utf8");
  const fields = features.length ? Object.keys(features[0].properties) : [];
  const sampleRecords = features.slice(0, 2).map(feature => feature.properties);
  const objectNames = new Set();
  const overlapBySite = {};

  for (const feature of features) {
    for (const value of Object.values(feature.properties)) {
      if (typeof value === "string" && value.trim()) objectNames.add(value.trim());
    }
  }

  for (const [siteId, boundary] of Object.entries(boundaryBySite)) {
    overlapBySite[siteId] = features.some(feature => {
      if (!feature.geometry) return false;
      return Boolean(turf.intersect(turf.featureCollection([boundary, featureFromGeometry(feature.geometry)])));
    });
  }

  const desiredZones = [
    "제1종일반주거지역",
    "준주거지역",
    "일반상업지역",
    "준공업지역",
    "자연녹지지역"
  ];
  const matchedDesiredZones = desiredZones.filter(zone => [...objectNames].some(name => name.includes(zone)));

  return {
    sourcePath: ZONING_LAYER.shpPath,
    recordCount: features.length,
    geometryType: features.length ? features[0].geometry.type : null,
    fields,
    sampleRecords,
    prj,
    overlapBySite,
    matchedDesiredZones,
    usableForZoningComposition: false,
    reason: [
      "필드에 용도지역명 또는 용도지역코드가 없다.",
      "표본값이 '건축허가 제한지역' 계열이며 법정 용도지역 객체가 아니다.",
      "요구 대상 용도지역 5종이 속성값에서 확인되지 않는다."
    ]
  };
}

function buildBoundary4326(boundary5186) {
  return featureFromGeometry(
    transformGeometry(boundary5186.geometry, "EPSG:5186", "EPSG:4326"),
    boundary5186.properties ?? {}
  );
}

function aggregateByKey(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const current = map.get(key) ?? [];
    current.push(row);
    map.set(key, current);
  }
  return map;
}

async function analyzeSite(config) {
  const boundary5186 = readJson(config.boundaryPath);
  const boundary4326 = buildBoundary4326(boundary5186);
  const boundary5186Feature = featureFromGeometry(boundary5186.geometry, boundary5186.properties ?? {});
  const boundaryBbox = geometryBbox(boundary5186.geometry);
  const parcelFeatures = await readParcels(config);
  const buildings = readCsvCp949(config.buildingCsvPath);

  const parcelMap = new Map();
  const allParcelPnuSet = new Set(parcelFeatures.map(parcel => parcel.pnu));
  const inBoundaryParcels = [];

  for (const parcelFeature of parcelFeatures) {
    const centroid4326 = turf.centroid(
      featureFromGeometry(transformGeometry(parcelFeature.geometry5186, "EPSG:5186", "EPSG:4326"))
    );
    const centroidInside = turf.booleanPointInPolygon(centroid4326, boundary4326);
    if (!centroidInside) continue;

    let areaSqm = 0;
    const parcelBbox = geometryBbox(parcelFeature.geometry5186);
    if (bboxesOverlap(parcelBbox, boundaryBbox)) {
      const intersection = turf.intersect(
        turf.featureCollection([boundary5186Feature, featureFromGeometry(parcelFeature.geometry5186)])
      );
      if (intersection?.geometry) {
        areaSqm = planarArea(intersection.geometry);
      }
    }

    const current = parcelMap.get(parcelFeature.pnu) ?? {
      pnu: parcelFeature.pnu,
      jibun: parcelFeature.jibun,
      fullAreaSqm: 0,
      areaSqm: 0,
      inBoundary: true
    };
    current.jibun = current.jibun || parcelFeature.jibun;
    current.fullAreaSqm = Math.max(current.fullAreaSqm, planarArea(parcelFeature.geometry5186));
    current.areaSqm = Math.max(current.areaSqm, areaSqm);
    parcelMap.set(parcelFeature.pnu, current);
  }

  for (const parcel of parcelMap.values()) {
    inBoundaryParcels.push(parcel);
  }

  const joinedBuildings = [];
  let matchedRows = 0;
  let insideBoundaryRows = 0;

  for (const row of buildings) {
    const pnu = buildPnu(row);
    if (allParcelPnuSet.has(pnu)) matchedRows += 1;
    const parcel = parcelMap.get(pnu);
    if (!parcel) continue;
    if (!parcel.inBoundary) continue;
    insideBoundaryRows += 1;
    joinedBuildings.push({
      pnu,
      mainUse: (row["주용도코드명"] ?? "").trim() || "미상",
      grossFloorAreaSqm: parseNumber(row["연면적(㎡)"]) ?? 0,
      floorAreaForFarSqm: parseNumber(row["용적률산정연면적(㎡)"]) ?? parseNumber(row["연면적(㎡)"]) ?? 0,
      parcelAreaSqm: parseNumber(row["대지면적(㎡)"]) ?? parcel.areaSqm ?? 0,
      farPercentRaw: parseNumber(row["용적률(%)"]),
      approvalDate: row["사용승인일"] ?? "",
      managementPk: row["관리건축물대장PK"] ?? ""
    });
  }

  const buildingRowsByParcel = aggregateByKey(joinedBuildings, row => row.pnu);
  const builtParcels = [];
  const unbuiltParcels = [];

  for (const parcel of inBoundaryParcels) {
    const parcelBuildings = buildingRowsByParcel.get(parcel.pnu) ?? [];
    const floorAreaForFarSqm = parcelBuildings.reduce((sum, row) => sum + row.floorAreaForFarSqm, 0);
    const grossFloorAreaSqm = parcelBuildings.reduce((sum, row) => sum + row.grossFloorAreaSqm, 0);
    const parcelAreaSqm = parcel.areaSqm;
    const parcelFarPercent = parcelAreaSqm ? (floorAreaForFarSqm / parcelAreaSqm) * 100 : null;
    const summary = {
      siteId: config.siteId,
      siteName: config.siteName,
      pnu: parcel.pnu,
      jibun: parcel.jibun,
      parcelAreaSqm: round(parcelAreaSqm, 3),
      buildingCount: parcelBuildings.length,
      grossFloorAreaSqm: round(grossFloorAreaSqm, 3),
      floorAreaForFarSqm: round(floorAreaForFarSqm, 3),
      parcelFarPercent: round(parcelFarPercent, 3),
      built: parcelBuildings.length > 0 ? 1 : 0
    };
    if (parcelBuildings.length > 0) builtParcels.push(summary);
    else unbuiltParcels.push(summary);
  }

  const totalParcelAreaSqm = inBoundaryParcels.reduce((sum, parcel) => sum + parcel.areaSqm, 0);
  const totalGrossFloorAreaSqm = joinedBuildings.reduce((sum, row) => sum + row.grossFloorAreaSqm, 0);
  const totalFloorAreaForFarSqm = joinedBuildings.reduce((sum, row) => sum + row.floorAreaForFarSqm, 0);

  const useMap = new Map();
  for (const row of joinedBuildings) {
    const current = useMap.get(row.mainUse) ?? {
      siteId: config.siteId,
      siteName: config.siteName,
      mainUse: row.mainUse,
      buildingCount: 0,
      grossFloorAreaSqm: 0,
      floorAreaForFarSqm: 0
    };
    current.buildingCount += 1;
    current.grossFloorAreaSqm += row.grossFloorAreaSqm;
    current.floorAreaForFarSqm += row.floorAreaForFarSqm;
    useMap.set(row.mainUse, current);
  }

  const useRows = [...useMap.values()]
    .sort((a, b) => b.grossFloorAreaSqm - a.grossFloorAreaSqm || b.buildingCount - a.buildingCount)
    .map(row => ({
      ...row,
      buildingCountShare: joinedBuildings.length ? row.buildingCount / joinedBuildings.length : 0,
      grossFloorAreaShare: totalGrossFloorAreaSqm ? row.grossFloorAreaSqm / totalGrossFloorAreaSqm : 0,
      floorAreaForFarShare: totalFloorAreaForFarSqm ? row.floorAreaForFarSqm / totalFloorAreaForFarSqm : 0
    }));

  const siteLevelFarPercent = totalParcelAreaSqm ? (totalFloorAreaForFarSqm / totalParcelAreaSqm) * 100 : null;
  const meanParcelFarBuiltOnly = builtParcels.length
    ? builtParcels.reduce((sum, parcel) => sum + (parcel.parcelFarPercent ?? 0), 0) / builtParcels.length
    : null;
  const meanParcelFarAllParcels = inBoundaryParcels.length
    ? [...builtParcels, ...unbuiltParcels].reduce((sum, parcel) => sum + (parcel.parcelFarPercent ?? 0), 0) / inBoundaryParcels.length
    : null;

  const expectedSummary = readJson(config.expectedSummaryPath);
  const validation = {
    expectedBuildingCount: expectedSummary.buildingCount,
    recalculatedBuildingCount: joinedBuildings.length,
    buildingCountMatches: expectedSummary.buildingCount === joinedBuildings.length,
    expectedGrossAreaSumSqm: expectedSummary.grossAreaSumSqm,
    recalculatedGrossAreaSumSqm: round(totalGrossFloorAreaSqm, 6),
    grossAreaDifferenceSqm: round(totalGrossFloorAreaSqm - expectedSummary.grossAreaSumSqm, 6),
    parcelMatchedRowsExpected: expectedSummary.parcelMatchedRows,
    parcelMatchedRowsRecalculated: matchedRows,
    insideBoundaryRowsExpected: expectedSummary.insideBoundaryRows,
    insideBoundaryRowsRecalculated: insideBoundaryRows
  };

  return {
    summary: {
      siteId: config.siteId,
      siteName: config.siteName,
      boundaryAreaSqm: round(planarArea(boundary5186.geometry), 3),
      parcelCountInBoundary: inBoundaryParcels.length,
      builtParcelCount: builtParcels.length,
      unbuiltParcelCount: unbuiltParcels.length,
      unbuiltParcelRatioCount: inBoundaryParcels.length ? unbuiltParcels.length / inBoundaryParcels.length : null,
      unbuiltParcelAreaSqm: round(unbuiltParcels.reduce((sum, parcel) => sum + (parcel.parcelAreaSqm ?? 0), 0), 3),
      totalParcelAreaSqm: round(totalParcelAreaSqm, 3),
      unbuiltParcelRatioArea: totalParcelAreaSqm
        ? unbuiltParcels.reduce((sum, parcel) => sum + (parcel.parcelAreaSqm ?? 0), 0) / totalParcelAreaSqm
        : null,
      buildingCount: joinedBuildings.length,
      totalGrossFloorAreaSqm: round(totalGrossFloorAreaSqm, 3),
      totalFloorAreaForFarSqm: round(totalFloorAreaForFarSqm, 3),
      siteLevelFarPercent: round(siteLevelFarPercent, 3),
      meanParcelFarPercentBuiltOnly: round(meanParcelFarBuiltOnly, 3),
      meanParcelFarPercentAllParcels: round(meanParcelFarAllParcels, 3),
      lumEntropyFloorArea: null,
      lumEntropyFloorAreaNormalized: null,
      lumEntropyBuildingCount: null,
      lumEntropyBuildingCountNormalized: null,
      lumCategoryCountGlobal: null,
      lumObservedCategoryCount: useRows.length,
      totalBuildingLedgerRows: buildings.length,
      parcelMatchedRows: matchedRows,
      insideBoundaryRows,
      parcelMatchRate: buildings.length ? matchedRows / buildings.length : null,
      validation
    },
    useRows: useRows.map(row => ({
      ...row,
      grossFloorAreaSqm: round(row.grossFloorAreaSqm, 3),
      floorAreaForFarSqm: round(row.floorAreaForFarSqm, 3),
      buildingCountShare: round(row.buildingCountShare, 6),
      grossFloorAreaShare: round(row.grossFloorAreaShare, 6),
      floorAreaForFarShare: round(row.floorAreaForFarShare, 6)
    })),
    parcelRows: [...builtParcels, ...unbuiltParcels].sort((a, b) => String(a.pnu).localeCompare(String(b.pnu), "ko"))
  };
}

async function main() {
  const boundaryBySite = Object.fromEntries(
    STUDY_SITES.map(config => [config.siteId, readJson(config.boundaryPath)])
  );
  const zoningAssessment = await assessZoningLayer(boundaryBySite);

  const siteResults = [];
  const buildingUseRows = [];
  const parcelRows = [];

  for (const config of STUDY_SITES) {
    const result = await analyzeSite(config);
    siteResults.push(result.summary);
    buildingUseRows.push(...result.useRows);
    parcelRows.push(...result.parcelRows);
  }

  const globalCategoryList = [...new Set(buildingUseRows.map(row => row.mainUse))]
    .sort((a, b) => a.localeCompare(b, "ko"));

  for (const site of siteResults) {
    const siteUseRows = buildingUseRows.filter(row => row.siteId === site.siteId);
    const sharesByUse = new Map(siteUseRows.map(row => [row.mainUse, row.grossFloorAreaShare]));
    const countSharesByUse = new Map(siteUseRows.map(row => [row.mainUse, row.buildingCountShare]));
    const floorEntropy = computeEntropy(
      globalCategoryList.map(category => sharesByUse.get(category) ?? 0),
      globalCategoryList.length
    );
    const countEntropy = computeEntropy(
      globalCategoryList.map(category => countSharesByUse.get(category) ?? 0),
      globalCategoryList.length
    );

    site.lumEntropyFloorArea = round(floorEntropy.entropy, 6);
    site.lumEntropyFloorAreaNormalized = round(floorEntropy.normalized, 6);
    site.lumEntropyBuildingCount = round(countEntropy.entropy, 6);
    site.lumEntropyBuildingCountNormalized = round(countEntropy.normalized, 6);
    site.lumCategoryCountGlobal = globalCategoryList.length;
  }

  writeJson("data/processed/zoning_shp_compatibility.json", zoningAssessment);
  writeJson("data/processed/land_use_metrics_summary.json", {
    generatedAt: new Date().toISOString(),
    lumMethod: {
      basis: "건축물대장 주용도코드명",
      weight: "연면적(㎡) 비중과 건축물 수 비중을 모두 계산",
      formula: "H = -Σ(p_i ln p_i), normalized = H / ln(K_global)",
      globalCategoryCount: globalCategoryList.length,
      globalCategories: globalCategoryList
    },
    zoningComposition: {
      status: "unavailable",
      reason: zoningAssessment.reason,
      sourcePath: zoningAssessment.sourcePath
    },
    sites: siteResults
  });
  writeCsv("data/processed/land_use_metrics_summary.csv", siteResults.map(site => ({
    ...site,
    validation: JSON.stringify(site.validation)
  })));
  writeCsv("data/processed/building_use_composition.csv", buildingUseRows);
  writeCsv("data/processed/development_realization_parcels.csv", parcelRows);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
