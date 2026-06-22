const fs = require("fs");
const path = require("path");
const readline = require("readline");
const shapefile = require("shapefile");
const proj4 = require("proj4");
const turf = require("@turf/turf");
const iconv = require("iconv-lite");

const baseDir = path.resolve(__dirname, "..");

proj4.defs(
  "EPSG:5174",
  "+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-146.43,507.89,681.46 +units=m +no_defs"
);
proj4.defs(
  "EPSG:5186",
  "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs"
);

const SITES = [
  {
    siteId: "pangyo",
    siteName: "판교 도시지원시설용지",
    boundaryPath: "data/raw/boundary/pangyo_urban_support_only.geojson",
    parcelShpPath:
      "판교테크노벨리/LSMD_CONT_LDREG_5174_경기_성남시_분당구/LSMD_CONT_LDREG_5174_41135_202606.shp",
    parcelDbfPath:
      "판교테크노벨리/LSMD_CONT_LDREG_5174_경기_성남시_분당구/LSMD_CONT_LDREG_5174_41135_202606.dbf",
    parcelCrs: "EPSG:5174"
  },
  {
    siteId: "okjeong",
    siteName: "양주 옥정 자족용지",
    boundaryPath: "data/raw/boundary/okjeong_urban_support_only.geojson",
    parcelShpPath:
      "양주옥정신도시/LSMD_CONT_LDREG_경기_양주시/LSMD_CONT_LDREG_41630_202606.shp",
    parcelDbfPath:
      "양주옥정신도시/LSMD_CONT_LDREG_경기_양주시/LSMD_CONT_LDREG_41630_202606.dbf",
    parcelCrs: "EPSG:5186"
  }
];

const planningCsvPath =
  "경기도_토지이용계획정보_AL_D155_41_20260609/AL_D155_41_20260609.csv";

const detailedZones = new Set([
  "제1종전용주거지역",
  "제2종전용주거지역",
  "제1종일반주거지역",
  "제2종일반주거지역",
  "제3종일반주거지역",
  "준주거지역",
  "중심상업지역",
  "일반상업지역",
  "근린상업지역",
  "유통상업지역",
  "전용공업지역",
  "일반공업지역",
  "준공업지역",
  "보전녹지지역",
  "생산녹지지역",
  "자연녹지지역",
  "보전관리지역",
  "생산관리지역",
  "계획관리지역",
  "농림지역",
  "자연환경보전지역"
]);

const broadZones = new Set([
  "도시지역",
  "관리지역"
]);

function abs(relativePath) {
  return path.join(baseDir, relativePath);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(abs(relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  fs.writeFileSync(abs(relativePath), JSON.stringify(value, null, 2), "utf8");
}

function writeText(relativePath, value) {
  fs.writeFileSync(abs(relativePath), value, "utf8");
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

async function readTargetParcels() {
  const targetParcels = new Map();

  for (const site of SITES) {
    const boundary = readJson(site.boundaryPath);
    const boundaryFeature = {
      type: "Feature",
      properties: boundary.properties ?? {},
      geometry: boundary.geometry
    };
    const boundaryBbox = geometryBbox(boundary.geometry);
    const source = await shapefile.open(abs(site.parcelShpPath), abs(site.parcelDbfPath), {
      encoding: "euc-kr"
    });

    while (true) {
      const result = await source.read();
      if (result.done) break;
      const feature = result.value;
      const geometry5186 =
        site.parcelCrs === "EPSG:5186"
          ? feature.geometry
          : transformGeometry(feature.geometry, site.parcelCrs, "EPSG:5186");
      const bbox = geometryBbox(geometry5186);
      if (!bboxesOverlap(boundaryBbox, bbox)) continue;
      const intersection = turf.intersect(
        turf.featureCollection([
          boundaryFeature,
          { type: "Feature", properties: feature.properties, geometry: geometry5186 }
        ])
      );
      if (!intersection?.geometry) continue;
      const intersectionAreaSqm = planarArea(intersection.geometry);
      if (!intersectionAreaSqm) continue;

      const pnu = feature.properties.PNU;
      const existing = targetParcels.get(pnu);
      const row = {
        siteId: site.siteId,
        siteName: site.siteName,
        pnu,
        jibun: feature.properties.JIBUN ?? "",
        intersectionAreaSqm
      };
      if (!existing || intersectionAreaSqm > existing.intersectionAreaSqm) {
        targetParcels.set(pnu, row);
      }
    }
  }

  return targetParcels;
}

function parsePnuFromPlanningRow(row) {
  const bjd = String(row["법정동코드"] ?? "").trim();
  const jibun = String(row["지번"] ?? "").trim();
  if (!bjd || !jibun) return null;
  const match = jibun.match(/^(산)?\s*(\d+)(?:-(\d+))?$/);
  if (!match) return null;
  const isMountain = Boolean(match[1]);
  const bun = match[2].padStart(4, "0");
  const ji = (match[3] ?? "0").padStart(4, "0");
  const landType = isMountain ? "2" : "1";
  return `${bjd}${landType}${bun}${ji}`;
}

function chooseApproximateZones(records) {
  const detailedIncluded = [...new Set(records
    .filter(record => record.status === "포함" && detailedZones.has(record.zoneName))
    .map(record => record.zoneName))];
  if (detailedIncluded.length) {
    return { selectedZones: detailedIncluded, basis: "included_detailed" };
  }

  const detailedAny = [...new Set(records
    .filter(record => detailedZones.has(record.zoneName))
    .map(record => record.zoneName))];
  if (detailedAny.length) {
    return { selectedZones: detailedAny, basis: "all_detailed_equal_split" };
  }

  const broadIncluded = [...new Set(records
    .filter(record => record.status === "포함" && broadZones.has(record.zoneName))
    .map(record => record.zoneName))];
  if (broadIncluded.length) {
    return { selectedZones: broadIncluded, basis: "included_broad_fallback" };
  }

  const broadAny = [...new Set(records
    .filter(record => broadZones.has(record.zoneName))
    .map(record => record.zoneName))];
  if (broadAny.length) {
    return { selectedZones: broadAny, basis: "all_broad_fallback" };
  }

  return { selectedZones: [], basis: "no_legal_zone_found" };
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

async function collectPlanningRows(targetParcels) {
  const targetPnuSet = new Set(targetParcels.keys());
  const targetRecords = new Map();
  const headers = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(abs(planningCsvPath)).pipe(iconv.decodeStream("cp949")),
    crlfDelay: Infinity
  });

  let lineIndex = 0;
  for await (const line of rl) {
    if (!line) continue;
    const cells = parseCsvLine(line);
    if (lineIndex === 0) {
      headers.push(...cells);
      lineIndex += 1;
      continue;
    }
    const row = {};
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = cells[i] ?? "";
    }

    const pnu = parsePnuFromPlanningRow(row);
    if (!pnu || !targetPnuSet.has(pnu)) {
      lineIndex += 1;
      continue;
    }

    const current = targetRecords.get(pnu) ?? [];
    current.push({
      pnu,
      uniqueId: row["고유번호"],
      zoneCode: row["용도지역지구코드"],
      zoneName: row["용도지역지구명"],
      status: row["저촉여부"],
      parcelType: row["대장구분명"],
      sourceDate: row["데이터기준일자"]
    });
    targetRecords.set(pnu, current);
    lineIndex += 1;
  }

  return targetRecords;
}

function round(value, digits = 6) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeNumberText(value, pad) {
  const raw = (value ?? "").toString().trim();
  if (!raw) return "".padStart(pad, "0");
  const digits = raw.replace(/[^\d]/g, "");
  return digits.padStart(pad, "0");
}

function readBuildingRowsForSite(siteId) {
  const relativePath = siteId === "pangyo"
    ? "data/raw/building/seongnam_bundang_building.csv"
    : "data/raw/building/yangju_building.csv";
  const buffer = fs.readFileSync(abs(relativePath));
  const text = buffer.slice(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
    ? buffer.toString("utf8")
    : iconv.decode(buffer, "cp949");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < header.length; j += 1) row[header[j]] = cells[j] ?? "";
    rows.push(row);
  }
  return rows;
}

function buildBuildingPnu(row) {
  const sgg = normalizeNumberText(row["시군구코드"], 5);
  const bjd = normalizeNumberText(row["법정동코드"], 5);
  const landType = String(Number((row["대지구분코드"] ?? "0").toString().trim() || "0") + 1);
  const bun = normalizeNumberText(row["번"], 4);
  const ji = normalizeNumberText(row["지"], 4);
  return `${sgg}${bjd}${landType}${bun}${ji}`;
}

async function main() {
  const targetParcels = await readTargetParcels();
  const targetRecords = await collectPlanningRows(targetParcels);
  const builtPnuBySite = new Map();
  for (const site of SITES) {
    const set = new Set();
    for (const row of readBuildingRowsForSite(site.siteId)) {
      set.add(buildBuildingPnu(row));
    }
    builtPnuBySite.set(site.siteId, set);
  }

  const aggregateRows = [];
  const parcelDetailRows = [];
  const siteSummaries = new Map(SITES.map(site => [site.siteId, {
    siteId: site.siteId,
    siteName: site.siteName,
    totalIntersectionAreaSqm: 0,
    coveredParcelCount: 0,
    uncoveredParcelCount: 0,
    equalSplitParcelCount: 0,
    fallbackParcelCount: 0
  }]));

  const areaBySiteAndZone = new Map();

  for (const parcel of targetParcels.values()) {
    const siteSummary = siteSummaries.get(parcel.siteId);
    siteSummary.totalIntersectionAreaSqm += parcel.intersectionAreaSqm;
    const built = builtPnuBySite.get(parcel.siteId)?.has(parcel.pnu) ?? false;

    const records = targetRecords.get(parcel.pnu) ?? [];
    const { selectedZones, basis } = chooseApproximateZones(records);
    if (!selectedZones.length) {
      siteSummary.uncoveredParcelCount += 1;
      parcelDetailRows.push({
        siteId: parcel.siteId,
        siteName: parcel.siteName,
        pnu: parcel.pnu,
        jibun: parcel.jibun,
        intersectionAreaSqm: round(parcel.intersectionAreaSqm, 3),
        built: built ? 1 : 0,
        selectedZones: "",
        selectedZoneCount: 0,
        allocationBasis: basis,
        allocatedAreaPerZoneSqm: ""
      });
      continue;
    }

    siteSummary.coveredParcelCount += 1;
    if (selectedZones.length >= 2) siteSummary.equalSplitParcelCount += 1;
    if (basis.includes("fallback")) siteSummary.fallbackParcelCount += 1;

    const allocatedArea = parcel.intersectionAreaSqm / selectedZones.length;
    for (const zoneName of selectedZones) {
      const key = `${parcel.siteId}||${zoneName}`;
      areaBySiteAndZone.set(key, (areaBySiteAndZone.get(key) ?? 0) + allocatedArea);
    }

    parcelDetailRows.push({
      siteId: parcel.siteId,
      siteName: parcel.siteName,
      pnu: parcel.pnu,
      jibun: parcel.jibun,
      intersectionAreaSqm: round(parcel.intersectionAreaSqm, 3),
      built: built ? 1 : 0,
      selectedZones: selectedZones.join(" | "),
      selectedZoneCount: selectedZones.length,
      allocationBasis: basis,
      allocatedAreaPerZoneSqm: round(allocatedArea, 3)
    });
  }

  for (const site of SITES) {
    const siteSummary = siteSummaries.get(site.siteId);
    const siteRows = [];
    for (const [key, areaSqm] of areaBySiteAndZone.entries()) {
      const [siteId, zoneName] = key.split("||");
      if (siteId !== site.siteId) continue;
      siteRows.push({
        siteId,
        siteName: site.siteName,
        zoneName,
        approximateAreaSqm: round(areaSqm, 3),
        approximateShare: siteSummary.totalIntersectionAreaSqm
          ? round(areaSqm / siteSummary.totalIntersectionAreaSqm, 6)
          : null,
        totalStudyAreaSqm: round(siteSummary.totalIntersectionAreaSqm, 3),
        method: "included_first_then_equal_split",
        exactness: "approximate"
      });
    }
    siteRows.sort((a, b) => b.approximateAreaSqm - a.approximateAreaSqm || a.zoneName.localeCompare(b.zoneName, "ko"));
    aggregateRows.push(...siteRows);
  }

  const summaryRows = [...siteSummaries.values()].map(summary => ({
    ...summary,
    totalIntersectionAreaSqm: round(summary.totalIntersectionAreaSqm, 3),
    coveredAreaSqm: round(
      parcelDetailRows
        .filter(row => row.siteId === summary.siteId && row.selectedZoneCount > 0)
        .reduce((sum, row) => sum + row.intersectionAreaSqm, 0),
      3
    )
  }));

  const outputJson = {
    generatedAt: new Date().toISOString(),
    sourceData: {
      planningCsvPath,
      planningSpatialReference:
        "토지이용계획정보 CSV는 비공간 자료이며, 분석경계 교차 면적은 연속지적도와 결합하여 계산함",
      limitation:
        "정확한 용도지역 경계 폴리곤이 없어 필지 내부 복수 용도지역 면적을 직접 분해할 수 없음"
    },
    methodology: {
      legalZoneSelection:
        "필지별 용도지역지구명에서 법정 용도지역명만 추출",
      prioritization:
        "포함(포함) 상태의 상세 용도지역 우선, 없으면 상세 용도지역 전체 사용, 그래도 없으면 상위 범주(도시지역·관리지역)로 fallback",
      areaAllocation:
        "한 필지에 복수 용도지역이 남으면 필지의 연구경계 교차면적을 용도지역 수로 균등 배분",
      resultType:
        "근사치이며 보고서 본문과 주석에 한계를 반드시 명시해야 함"
    },
    siteCoverage: summaryRows,
    approximateZoningComposition: aggregateRows,
    parcelAllocations: parcelDetailRows
  };

  const cautionText = [
    "주의: 본 용도지역 구성비는 근사치이다.",
    "정확한 용도지역 경계 폴리곤을 확보하지 못해 VWorld 토지이용계획정보 CSV의 필지별 용도지역 목록을 이용하였다.",
    "필지 내부에 복수 법정 용도지역이 함께 존재하는 경우 실제 면적분해가 불가능하므로, 포함(포함) 상태의 상세 용도지역을 우선 채택하고 복수 항목이 남을 경우 연구경계와의 교차면적을 균등 배분하였다.",
    "따라서 결과는 연구지의 대략적 용도지역 경향을 파악하기 위한 보조지표로만 사용해야 하며, 법정 용도지역의 정확 면적비와 동일하게 해석하면 안 된다.",
  ].join("\n");

  writeJson("data/processed/approximate_zoning_composition.json", outputJson);
  writeCsv("data/processed/approximate_zoning_composition.csv", aggregateRows);
  writeCsv("data/processed/approximate_zoning_composition_parcels.csv", parcelDetailRows);
  writeText("data/processed/approximate_zoning_composition_notice.txt", cautionText);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
