const fs = require("fs");
const path = require("path");

const baseDir = path.resolve(__dirname, "..");

const SITE_META = {
  pangyo: {
    id: "pangyo",
    displayName: "판교 도시지원시설용지",
    shortName: "판교",
    mapNote: "판교 제1테크노밸리 분석 경계",
    boundaryPath: "data/raw/boundary/pangyo_urban_support_only.geojson",
    buildingSummaryPath: "data/processed/pangyo_buildings_in_boundary_summary.json",
    sgisAreaPath: "data/processed/pangyo_sgis_area_weighted_summary.json",
    sgisFloorPath: "data/processed/pangyo_sgis_floor_area_weighted_summary.json"
  },
  okjeong: {
    id: "okjeong",
    displayName: "옥정 도시지원시설용지",
    shortName: "옥정",
    mapNote: "양주 옥정 자족용지 분석 경계",
    boundaryPath: "data/raw/boundary/okjeong_urban_support_only.geojson",
    buildingSummaryPath: "data/processed/okjeong_buildings_in_boundary_summary.json",
    sgisAreaPath: "data/processed/okjeong_sgis_area_weighted_summary.json",
    sgisFloorPath: "data/processed/okjeong_sgis_floor_area_weighted_summary.json"
  }
};

function abs(relativePath) {
  return path.join(baseDir, relativePath);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(abs(relativePath), "utf8"));
}

function writeText(relativePath, value) {
  fs.writeFileSync(abs(relativePath), value, "utf8");
}

function localDateStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDistribution(items) {
  return (items ?? []).map(item => ({
    name: item.mainUse ?? item.key ?? item.name ?? "",
    count: item.count ?? 0,
    grossFloorAreaSqm: item.grossFloorAreaSqm ?? null,
    share: item.grossFloorAreaShare ?? item.share ?? null,
    year: item.year ?? item.key ?? null
  }));
}

function buildSiteData(siteId, landUseSite, zoningBySite, zoningCoverageBySite) {
  const meta = SITE_META[siteId];
  const boundary = readJson(meta.boundaryPath);
  const buildingSummary = readJson(meta.buildingSummaryPath);
  const sgisArea = readJson(meta.sgisAreaPath);
  const sgisFloor = readJson(meta.sgisFloorPath);
  const useRows = normalizeDistribution(buildingSummary.primaryUseDistribution).slice(0, 6);
  const zoningRows = (zoningBySite.get(siteId) ?? [])
    .sort((a, b) => (b.approximateAreaSqm ?? 0) - (a.approximateAreaSqm ?? 0));
  const coverage = zoningCoverageBySite.get(siteId) ?? null;

  return {
    id: meta.id,
    displayName: meta.displayName,
    shortName: meta.shortName,
    boundary,
    areaSqm: landUseSite.boundaryAreaSqm,
    buildingCount: landUseSite.buildingCount,
    grossFloorAreaSqm: landUseSite.totalGrossFloorAreaSqm,
    farPercent: landUseSite.siteLevelFarPercent,
    unbuiltParcelRatioCount: landUseSite.unbuiltParcelRatioCount,
    unbuiltParcelRatioArea: landUseSite.unbuiltParcelRatioArea,
    lumEntropyFloorAreaNormalized: landUseSite.lumEntropyFloorAreaNormalized,
    population: sgisArea.totalPopulation,
    businessAreaWeighted: sgisArea.totalBusiness,
    workersAreaWeighted: sgisArea.totalWorkers,
    businessFloorWeighted: sgisFloor.businessFloorWeighted,
    workersFloorWeighted: sgisFloor.workersFloorWeighted,
    buildingUses: useRows,
    approvalYearDistribution: normalizeDistribution(buildingSummary.approvalYearDistribution),
    zoning: zoningRows.map(row => ({
      name: row.zoneName,
      areaSqm: row.approximateAreaSqm,
      share: row.approximateShare
    })),
    zoningCoverage: coverage
      ? {
          coveredParcelCount: coverage.coveredParcelCount,
          uncoveredParcelCount: coverage.uncoveredParcelCount,
          coveredAreaSqm: coverage.coveredAreaSqm,
          totalIntersectionAreaSqm: coverage.totalIntersectionAreaSqm
        }
      : null,
    mapNote: meta.mapNote,
    sgis: {
      areaWeightedPopulation: sgisArea.totalPopulation,
      areaWeightedBusiness: sgisArea.totalBusiness,
      areaWeightedWorkers: sgisArea.totalWorkers,
      floorWeightedBusiness: sgisFloor.businessFloorWeighted,
      floorWeightedWorkers: sgisFloor.workersFloorWeighted
    }
  };
}

function main() {
  const landUseSummary = readJson("data/processed/land_use_metrics_summary.json");
  const approximateZoning = readJson("data/processed/approximate_zoning_composition.json");
  const landUseSites = new Map((landUseSummary.sites ?? []).map(site => [site.siteId, site]));
  const zoningBySite = new Map();
  const zoningCoverageBySite = new Map(
    (approximateZoning.siteCoverage ?? []).map(site => [site.siteId, site])
  );

  for (const row of approximateZoning.approximateZoningComposition ?? []) {
    const current = zoningBySite.get(row.siteId) ?? [];
    current.push(row);
    zoningBySite.set(row.siteId, current);
  }

  const sites = {};
  for (const siteId of Object.keys(SITE_META)) {
    const landUseSite = landUseSites.get(siteId);
    if (!landUseSite) {
      throw new Error(`Missing land use summary for ${siteId}`);
    }
    sites[siteId] = buildSiteData(siteId, landUseSite, zoningBySite, zoningCoverageBySite);
  }

  const data = {
    generatedAt: localDateStamp(),
    title: "판교 제1테크노밸리 · 양주 옥정 자족용지 비교 대시보드",
    zoningNotice: fs.readFileSync(
      abs("data/processed/approximate_zoning_composition_notice.txt"),
      "utf8"
    ).trim(),
    sites
  };

  writeText(
    "docs/data/dashboard-data.js",
    `window.DASHBOARD_DATA = ${JSON.stringify(data)};\n`
  );
}

main();
