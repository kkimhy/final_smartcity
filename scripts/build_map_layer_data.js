const fs = require("fs");
const path = require("path");
const shapefile = require("shapefile");
const proj4 = require("proj4");
const turf = require("@turf/turf");
const { parse } = require("csv-parse/sync");

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

const STUDY_SITES = {
  pangyo: {
    siteId: "pangyo",
    displayName: "판교 도시지원시설용지",
    buildingPath: "data/processed/pangyo_buildings_in_boundary.csv",
    parcelShpPath:
      "판교테크노벨리/LSMD_CONT_LDREG_5174_경기_성남시_분당구/LSMD_CONT_LDREG_5174_41135_202606.shp",
    parcelDbfPath:
      "판교테크노벨리/LSMD_CONT_LDREG_5174_경기_성남시_분당구/LSMD_CONT_LDREG_5174_41135_202606.dbf",
    parcelCrs: "EPSG:5174"
  },
  okjeong: {
    siteId: "okjeong",
    displayName: "양주 옥정 자족용지",
    buildingPath: "data/processed/okjeong_buildings_in_boundary.csv",
    parcelShpPath:
      "양주옥정신도시/LSMD_CONT_LDREG_경기_양주시/LSMD_CONT_LDREG_41630_202606.shp",
    parcelDbfPath:
      "양주옥정신도시/LSMD_CONT_LDREG_경기_양주시/LSMD_CONT_LDREG_41630_202606.dbf",
    parcelCrs: "EPSG:5186"
  }
};

function abs(relativePath) {
  return path.join(baseDir, relativePath);
}

function readCsv(relativePath) {
  const text = fs.readFileSync(abs(relativePath), "utf8");
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true
  });
}

function writeText(relativePath, value) {
  fs.writeFileSync(abs(relativePath), value, "utf8");
}

function parseNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeMainUse(value) {
  return String(value || "").trim() || "미상";
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

function localDateStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function readParcelMap(siteConfig, parcelPnuSet) {
  const source = await shapefile.open(abs(siteConfig.parcelShpPath), abs(siteConfig.parcelDbfPath), {
    encoding: "euc-kr"
  });
  const parcelMap = new Map();

  while (true) {
    const result = await source.read();
    if (result.done) break;

    const feature = result.value;
    const pnu = feature?.properties?.PNU;
    if (!pnu || !parcelPnuSet.has(pnu)) continue;

    const geometry5186 = siteConfig.parcelCrs === "EPSG:5186"
      ? feature.geometry
      : transformGeometry(feature.geometry, siteConfig.parcelCrs, "EPSG:5186");
    const feature4326 = {
      type: "Feature",
      properties: {},
      geometry: transformGeometry(geometry5186, "EPSG:5186", "EPSG:4326")
    };
    const simplified = turf.simplify(feature4326, { tolerance: 0.000002, highQuality: false });
    const simplified5186 = transformGeometry(simplified.geometry, "EPSG:4326", "EPSG:5186");

    parcelMap.set(pnu, {
      pnu,
      jibun: feature.properties.JIBUN ?? "",
      geometry: simplified5186
    });
  }

  return parcelMap;
}

function buildBuildingRows(siteId, parcelFarByPnu) {
  const siteConfig = STUDY_SITES[siteId];
  const buildings = readCsv(siteConfig.buildingPath);

  return buildings
    .map(row => ({
      pnu: row.pnu,
      managementPk: row.managementPk,
      parcelJibun: row.parcelJibun,
      mainUse: normalizeMainUse(row.mainUse),
      grossFloorAreaSqm: parseNumber(row.grossFloorAreaSqm),
      approvalDate: row.approvalDate,
      approvalYear: parseNumber(row.approvalYear),
      centroidLon: parseNumber(row.centroidLon),
      centroidLat: parseNumber(row.centroidLat),
      parcelFarPercent: parcelFarByPnu.get(row.pnu) ?? null,
      siteAddress: row.siteAddress,
      roadAddress: row.roadAddress
    }))
    .filter(row => Number.isFinite(row.centroidLon) && Number.isFinite(row.centroidLat));
}

function buildPrimaryUseByPnu(buildingRows) {
  const aggregate = new Map();
  for (const row of buildingRows) {
    const byUse = aggregate.get(row.pnu) ?? new Map();
    const current = byUse.get(row.mainUse) ?? 0;
    byUse.set(row.mainUse, current + (row.grossFloorAreaSqm || 0));
    aggregate.set(row.pnu, byUse);
  }

  const primaryByPnu = new Map();
  for (const [pnu, byUse] of aggregate.entries()) {
    const ranked = [...byUse.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
    primaryByPnu.set(pnu, ranked[0]?.[0] ?? "미상");
  }
  return primaryByPnu;
}

function buildParcelZoningByPnu() {
  const rows = readCsv("data/processed/approximate_zoning_composition_parcels.csv");
  const zoningByPnu = new Map();

  for (const row of rows) {
    const zones = String(row.selectedZones || "")
      .split("|")
      .map(value => value.trim())
      .filter(Boolean);
    zoningByPnu.set(row.pnu, {
      selectedZones: zones,
      selectedZoneCount: parseNumber(row.selectedZoneCount) ?? zones.length,
      allocationBasis: row.allocationBasis || "",
      allocatedAreaPerZoneSqm: parseNumber(row.allocatedAreaPerZoneSqm),
      primaryZoning: zones[0] || "미상"
    });
  }

  return zoningByPnu;
}

async function buildSite(siteId, parcelRowsBySite, zoningByPnu) {
  const siteConfig = STUDY_SITES[siteId];
  const parcelRows = parcelRowsBySite.get(siteId) ?? [];
  const parcelFarByPnu = new Map(parcelRows.map(row => [row.pnu, parseNumber(row.parcelFarPercent)]));
  const buildingCountByPnu = new Map(parcelRows.map(row => [row.pnu, parseNumber(row.buildingCount) ?? 0]));
  const grossFloorAreaByPnu = new Map(parcelRows.map(row => [row.pnu, parseNumber(row.grossFloorAreaSqm) ?? 0]));
  const parcelAreaByPnu = new Map(parcelRows.map(row => [row.pnu, parseNumber(row.parcelAreaSqm) ?? 0]));
  const builtByPnu = new Map(parcelRows.map(row => [row.pnu, Number(row.built) === 1]));
  const buildingRows = buildBuildingRows(siteId, parcelFarByPnu);
  const primaryUseByPnu = buildPrimaryUseByPnu(buildingRows);
  const parcelMap = await readParcelMap(siteConfig, new Set(parcelRows.map(row => row.pnu)));

  const parcelFeatures = parcelRows
    .map(row => {
      const parcelFeature = parcelMap.get(row.pnu);
      if (!parcelFeature) return null;
      const zoning = zoningByPnu.get(row.pnu);
      return {
        type: "Feature",
        properties: {
          pnu: row.pnu,
          parcelJibun: row.jibun,
          parcelAreaSqm: parcelAreaByPnu.get(row.pnu) ?? null,
          buildingCount: buildingCountByPnu.get(row.pnu) ?? 0,
          grossFloorAreaSqm: grossFloorAreaByPnu.get(row.pnu) ?? 0,
          parcelFarPercent: parcelFarByPnu.get(row.pnu) ?? null,
          built: builtByPnu.get(row.pnu) ?? false,
          primaryBuildingUse: primaryUseByPnu.get(row.pnu) ?? "미상",
          primaryZoning: zoning?.primaryZoning ?? "미상",
          zoningLabels: zoning?.selectedZones ?? [],
          zoningAllocationBasis: zoning?.allocationBasis ?? "",
          zoningAllocatedAreaPerZoneSqm: zoning?.allocatedAreaPerZoneSqm ?? null
        },
        geometry: parcelFeature.geometry
      };
    })
    .filter(Boolean);

  const mainUses = [...new Set(buildingRows.map(row => row.mainUse).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), "ko")
  );
  const zoningCategories = [...new Set(parcelFeatures.map(feature => feature.properties.primaryZoning).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), "ko"));

  return {
    siteId,
    displayName: siteConfig.displayName,
    featureType: "building_centroid_and_parcel_polygon",
    colorBy: {
      building: "mainUse",
      parcel: "primaryZoning"
    },
    buildingCount: buildingRows.length,
    parcelCount: parcelFeatures.length,
    mainUses,
    zoningCategories,
    rows: buildingRows,
    parcelFeatures
  };
}

async function main() {
  const parcelRows = readCsv("data/processed/development_realization_parcels.csv");
  const parcelRowsBySite = parcelRows.reduce((map, row) => {
    const current = map.get(row.siteId) ?? [];
    current.push(row);
    map.set(row.siteId, current);
    return map;
  }, new Map());
  const zoningByPnu = buildParcelZoningByPnu();

  const sites = {};
  for (const siteId of Object.keys(STUDY_SITES)) {
    sites[siteId] = await buildSite(siteId, parcelRowsBySite, zoningByPnu);
  }

  const data = {
    generatedAt: localDateStamp(),
    note: "건축물 중심점은 주용도로, 필지 폴리곤은 추정 용도지역으로 색상화했다. 필지 용적률과 건축물 속성은 PNU 기준으로 조인했다.",
    sites
  };

  writeText("docs/data/map-layer-data.js", `window.MAP_LAYER_DATA = ${JSON.stringify(data)};\n`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
