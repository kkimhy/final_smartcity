(() => {
  const DATA = window.DASHBOARD_DATA;
  const TRANSPORT_DATA = window.TRANSPORT_DATA;
  const BUILDING_USE_DATA = window.BUILDING_USE_COMPOSITION_DATA;
  const MAP_LAYER_DATA = window.MAP_LAYER_DATA;

  const SITE_THEME = {
    pangyo: {
      border: "#1d4ed8",
      fill: "rgba(29, 78, 216, 0.24)"
    },
    okjeong: {
      border: "#0f766e",
      fill: "rgba(15, 118, 110, 0.24)"
    }
  };

  const BUILDING_USE_COLORS = ["#2563eb", "#0f766e", "#cbd5e1"];
  const MAP_USE_COLOR_CANDIDATES = [
    "#1d4ed8",
    "#0f766e",
    "#b45309",
    "#be185d",
    "#4338ca",
    "#475569",
    "#0f172a"
  ];
  const ZONING_COLOR_CANDIDATES = [
    "#f59e0b",
    "#ef4444",
    "#10b981",
    "#8b5cf6",
    "#0ea5e9",
    "#64748b"
  ];
  const MAP_INSTANCES = {};
  const MAP_COMPARE_STATE = {
    layout: "split",
    activeSiteId: "pangyo"
  };
  const SOCIO_COLORS = {
    pangyo: "#1d4ed8",
    okjeong: "#0f766e",
    neutral: "#cbd5e1",
    accent: "#b45309"
  };
  const SOCIO_INDUSTRY = {
    pangyo: {
      businessTop5: [
        { name: "정보통신업", value: 200.113, share: 26.633 },
        { name: "숙박 및 음식점업", value: 158.858, share: 21.143 },
        { name: "도매 및 소매업", value: 113.741, share: 15.138 },
        { name: "전문, 과학 및 기술 서비스업", value: 89.623, share: 11.928 },
        { name: "부동산업", value: 43.92, share: 5.845 }
      ],
      workersTop5: [
        { name: "정보통신업", value: 12049.819, share: 44.794 },
        { name: "전문, 과학 및 기술 서비스업", value: 5189.006, share: 19.29 },
        { name: "사업시설 관리·지원·임대", value: 3690.976, share: 13.721 },
        { name: "도매 및 소매업", value: 2178.254, share: 8.097 },
        { name: "제조업", value: 1209.671, share: 4.497 }
      ]
    },
    okjeong: {
      businessTop5: [
        { name: "도매 및 소매업", value: 19.347, share: 23.771 },
        { name: "정보통신업", value: 15.728, share: 19.324 },
        { name: "전문, 과학 및 기술 서비스업", value: 13.858, share: 17.027 },
        { name: "제조업", value: 8.245, share: 10.13 },
        { name: "부동산업", value: 6.613, share: 8.125 }
      ],
      workersTop5: [
        { name: "도매 및 소매업", value: 43.363, share: 17.268 },
        { name: "건설업", value: 37.096, share: 14.773 },
        { name: "교육 서비스업", value: 36.154, share: 14.398 },
        { name: "제조업", value: 23.272, share: 9.268 },
        { name: "정보통신업", value: 21.33, share: 8.494 }
      ]
    }
  };

  const EPSG5186 = {
    a: 6378137.0,
    f: 1 / 298.257222101,
    lat0: 38.0 * Math.PI / 180,
    lon0: 127.0 * Math.PI / 180,
    falseEasting: 200000.0,
    falseNorthing: 600000.0,
    k0: 1.0
  };

  EPSG5186.e2 = 2 * EPSG5186.f - EPSG5186.f * EPSG5186.f;
  EPSG5186.ep2 = EPSG5186.e2 / (1 - EPSG5186.e2);

  function formatNumber(value, digits = 0) {
    return Number(value || 0).toLocaleString("ko-KR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function formatPercent(value, digits = 1) {
    return `${formatNumber(Number(value || 0) * (value <= 1 ? 100 : 1), digits)}%`;
  }

  function formatPeople(value) {
    return `${formatNumber(value, 0)}명`;
  }

  function formatArea(value) {
    return `${formatNumber(value, 0)}㎡`;
  }

  function getMapLayerSite(siteId) {
    return MAP_LAYER_DATA?.sites?.[siteId] ?? null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildUseColorMap(mainUses) {
    return Object.fromEntries((mainUses || []).map((use, index) => [
      use,
      MAP_USE_COLOR_CANDIDATES[index % MAP_USE_COLOR_CANDIDATES.length]
    ]));
  }

  function buildZoningColorMap(zoningCategories) {
    return Object.fromEntries((zoningCategories || []).map((zone, index) => [
      zone,
      ZONING_COLOR_CANDIDATES[index % ZONING_COLOR_CANDIDATES.length]
    ]));
  }

  function meridionalArc(phi) {
    const e2 = EPSG5186.e2;
    const e4 = e2 * e2;
    const e6 = e4 * e2;
    return EPSG5186.a * (
      (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
      - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
      + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi)
      - (35 * e6 / 3072) * Math.sin(6 * phi)
    );
  }

  const M0 = meridionalArc(EPSG5186.lat0);

  function project5186To4326(point) {
    const x = point[0];
    const y = point[1];
    const e2 = EPSG5186.e2;
    const ep2 = EPSG5186.ep2;
    const e4 = e2 * e2;
    const e6 = e4 * e2;
    const xAdj = x - EPSG5186.falseEasting;
    const M = M0 + (y - EPSG5186.falseNorthing) / EPSG5186.k0;
    const mu = M / (
      EPSG5186.a * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256)
    );
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const e12 = e1 * e1;
    const e13 = e12 * e1;
    const e14 = e13 * e1;
    const phi1 = mu
      + (3 * e1 / 2 - 27 * e13 / 32) * Math.sin(2 * mu)
      + (21 * e12 / 16 - 55 * e14 / 32) * Math.sin(4 * mu)
      + (151 * e13 / 96) * Math.sin(6 * mu)
      + (1097 * e14 / 512) * Math.sin(8 * mu);

    const sinPhi1 = Math.sin(phi1);
    const cosPhi1 = Math.cos(phi1);
    const tanPhi1 = Math.tan(phi1);
    const N1 = EPSG5186.a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
    const R1 = EPSG5186.a * (1 - e2) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
    const T1 = tanPhi1 * tanPhi1;
    const C1 = ep2 * cosPhi1 * cosPhi1;
    const D = xAdj / (N1 * EPSG5186.k0);
    const D2 = D * D;
    const D4 = D2 * D2;
    const D6 = D4 * D2;

    const lat = phi1 - (N1 * tanPhi1 / R1) * (
      D2 / 2
      - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D4 / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D6 / 720
    );

    const lon = EPSG5186.lon0 + (
      D
      - (1 + 2 * T1 + C1) * D * D2 / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D * D4 / 120
    ) / cosPhi1;

    return [lon * 180 / Math.PI, lat * 180 / Math.PI];
  }

  function transformGeometry(geometry) {
    if (!geometry) return geometry;

    if (geometry.type === "Polygon") {
      return {
        ...geometry,
        coordinates: geometry.coordinates.map(ring => ring.map(project5186To4326))
      };
    }

    if (geometry.type === "MultiPolygon") {
      return {
        ...geometry,
        coordinates: geometry.coordinates.map(
          polygon => polygon.map(ring => ring.map(project5186To4326))
        )
      };
    }

    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }

  function transformFeature(feature) {
    return {
      ...feature,
      geometry: transformGeometry(feature.geometry)
    };
  }

  function renderMeta(site) {
    const meta = document.getElementById(`${site.id}-map-meta`);
    if (!meta) return;

    meta.innerHTML = `
      <div class="mini-stat">
        <strong>면적</strong>
        <span>${formatArea(site.areaSqm)}</span>
      </div>
      <div class="mini-stat">
        <strong>건물 수</strong>
        <span>${formatNumber(site.buildingCount)}개</span>
      </div>
      <div class="mini-stat">
        <strong>연면적</strong>
        <span>${formatArea(site.grossFloorAreaSqm)}</span>
      </div>
    `;
  }

  function topSiteBy(metric) {
    return Object.values(DATA.sites).reduce((best, site) => {
      if (!best) return site;
      return Number(site[metric] || 0) > Number(best[metric] || 0) ? site : best;
    }, null);
  }

  function renderComparison() {
    const container = document.getElementById("comparison-cards");
    if (!container) return;

    const farLeader = topSiteBy("farPercent");
    const jobsLeader = topSiteBy("workersFloorWeighted");
    const vacancyLeader = topSiteBy("unbuiltParcelRatioArea");

    const cards = [
      {
        title: "용적률 추정",
        rows: Object.values(DATA.sites).map(site => ({
          label: site.displayName,
          value: formatPercent(site.farPercent, 1)
        })),
        leader: `${farLeader.displayName} 우세`
      },
      {
        title: "고용 기반 추정",
        rows: Object.values(DATA.sites).map(site => ({
          label: site.displayName,
          value: `${formatNumber(site.workersFloorWeighted, 1)}명`,
          sub: "floor-weighted"
        })),
        leader: `${jobsLeader.displayName} 우세`
      },
      {
        title: "미개발 면적 비중",
        rows: Object.values(DATA.sites).map(site => ({
          label: site.displayName,
          value: formatPercent(site.unbuiltParcelRatioArea, 1)
        })),
        leader: `${vacancyLeader.displayName} 더 큼`
      }
    ];

    container.innerHTML = cards.map(card => `
      <article class="comparison-card">
        <h3>${card.title}</h3>
        <div class="metric-rows">
          ${card.rows.map(row => `
            <div class="metric-row">
              <div class="label">${row.label}</div>
              <div class="value">${row.value}${row.sub ? `<span class="sub">${row.sub}</span>` : ""}</div>
            </div>
          `).join("")}
          <div class="metric-row metric-row--note">
            <div class="label">비교 메모</div>
            <div class="value value--small">${card.leader}</div>
          </div>
        </div>
      </article>
    `).join("");
  }

  function buildStatsDonut(items) {
    let offset = 0;
    const stops = items.map(item => {
      const start = offset;
      offset += item.share;
      return `${item.color} ${start.toFixed(1)}% ${offset.toFixed(1)}%`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }

  function buildStatsBarRows(rows, formatter) {
    const maxValue = Math.max(...rows.map(row => row.value), 1);
    return `
      <div class="stats-panel-bars">
        ${rows.map(row => `
          <div class="stats-panel-bar-row">
            <strong>${row.label}</strong>
            <div class="stats-panel-bar-track">
              <div class="stats-panel-bar-fill stats-panel-bar-fill--${row.siteId}" style="width:${(row.value / maxValue) * 100}%;"></div>
            </div>
            <span>${formatter(row.value)}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderStatsPanel() {
    const container = document.getElementById("stats-panel-grid");
    if (!container || !DATA?.sites || !TRANSPORT_DATA?.sites || !BUILDING_USE_DATA?.rows) return;

    const rows = buildSocioRows();
    const pangyoTransport = getTransportSite("pangyo");
    const okjeongTransport = getTransportSite("okjeong");
    const compositionBySite = summarizeBuildingUseRows(BUILDING_USE_DATA.rows);

    const transportCard = `
      <article class="panel stats-panel-card">
        <div class="panel-top panel-top--compact">
          <div>
            <p class="section-kicker">3-1 Transport</p>
            <h3>등시간권 비교</h3>
            <p>30분과 60분 등시간권 기준 도달 인구와 종사자를 같은 카드에서 비교합니다.</p>
          </div>
        </div>
        <table class="stats-panel-table">
          <thead>
            <tr>
              <th>지표</th>
              <th>판교</th>
              <th>옥정</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>30분 도달 인구</td>
              <td>${formatPeople(getIsochroneMetric(pangyoTransport, 30, "reachablePopulation"))}</td>
              <td>${formatPeople(getIsochroneMetric(okjeongTransport, 30, "reachablePopulation"))}</td>
            </tr>
            <tr>
              <td>30분 도달 종사자</td>
              <td>${formatPeople(getIsochroneMetric(pangyoTransport, 30, "reachableWorkers"))}</td>
              <td>${formatPeople(getIsochroneMetric(okjeongTransport, 30, "reachableWorkers"))}</td>
            </tr>
            <tr>
              <td>60분 도달 인구</td>
              <td>${formatPeople(getIsochroneMetric(pangyoTransport, 60, "reachablePopulation"))}</td>
              <td>${formatPeople(getIsochroneMetric(okjeongTransport, 60, "reachablePopulation"))}</td>
            </tr>
            <tr>
              <td>60분 도달 종사자</td>
              <td>${formatPeople(getIsochroneMetric(pangyoTransport, 60, "reachableWorkers"))}</td>
              <td>${formatPeople(getIsochroneMetric(okjeongTransport, 60, "reachableWorkers"))}</td>
            </tr>
          </tbody>
        </table>
        ${buildStatsBarRows([
          { siteId: "pangyo", label: "판교 60분 종사자", value: getIsochroneMetric(pangyoTransport, 60, "reachableWorkers") },
          { siteId: "okjeong", label: "옥정 60분 종사자", value: getIsochroneMetric(okjeongTransport, 60, "reachableWorkers") }
        ], formatPeople)}
      </article>
    `;

    const landUseCard = `
      <article class="panel stats-panel-card">
        <div class="panel-top panel-top--compact">
          <div>
            <p class="section-kicker">3-2 Land Use</p>
            <h3>주용도 구성과 필지 지표</h3>
            <p>건축물 주용도 비중과 용적률, 미개발 필지 비율을 한 번에 비교합니다.</p>
          </div>
        </div>
        <div class="stats-panel-donuts">
          ${["pangyo", "okjeong"].map(siteId => {
            const site = DATA.sites[siteId];
            const items = (compositionBySite[siteId] || []).map(item => ({
              ...item,
              color: item.color,
              share: item.share
            }));
            return `
              <div class="stats-donut-card">
                <strong>${site.shortName}</strong>
                <div class="stats-donut" style="background:${buildStatsDonut(items)};"></div>
                <span>주용도 연면적 비중</span>
                <div class="stats-donut-legend">
                  ${items.map(item => `
                    <div>
                      <i style="background:${item.color};"></i>
                      <span>${item.name}</span>
                      <strong>${formatNumber(item.share, 1)}%</strong>
                    </div>
                  `).join("")}
                </div>
              </div>
            `;
          }).join("")}
        </div>
        <table class="stats-panel-table">
          <thead>
            <tr>
              <th>지표</th>
              <th>판교</th>
              <th>옥정</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>사업지 용적률</td>
              <td>${formatNumber(DATA.sites.pangyo.farPercent, 1)}%</td>
              <td>${formatNumber(DATA.sites.okjeong.farPercent, 1)}%</td>
            </tr>
            <tr>
              <td>미개발 필지 비율</td>
              <td>${formatPercent(DATA.sites.pangyo.unbuiltParcelRatioArea, 1)}</td>
              <td>${formatPercent(DATA.sites.okjeong.unbuiltParcelRatioArea, 1)}</td>
            </tr>
            <tr>
              <td>용도 혼합도</td>
              <td>${formatNumber((DATA.sites.pangyo.lumEntropyFloorAreaNormalized || 0) * 100, 1)}</td>
              <td>${formatNumber((DATA.sites.okjeong.lumEntropyFloorAreaNormalized || 0) * 100, 1)}</td>
            </tr>
          </tbody>
        </table>
      </article>
    `;

    const socioCard = `
      <article class="panel stats-panel-card">
        <div class="panel-top panel-top--compact">
          <div>
            <p class="section-kicker">3-3 Socioeconomic</p>
            <h3>인구·고용 비교</h3>
            <p>영역 내부 추정 인구와 사업체·종사자 규모를 막대와 표로 같이 봅니다.</p>
          </div>
        </div>
        <table class="stats-panel-table">
          <thead>
            <tr>
              <th>지표</th>
              <th>판교</th>
              <th>옥정</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>추정 인구</td>
              <td>${formatPeople(rows.find(row => row.id === "pangyo")?.population || 0)}</td>
              <td>${formatPeople(rows.find(row => row.id === "okjeong")?.population || 0)}</td>
            </tr>
            <tr>
              <td>추정 사업체</td>
              <td>${formatNumber(rows.find(row => row.id === "pangyo")?.business || 0, 1)}</td>
              <td>${formatNumber(rows.find(row => row.id === "okjeong")?.business || 0, 1)}</td>
            </tr>
            <tr>
              <td>추정 종사자</td>
              <td>${formatPeople(rows.find(row => row.id === "pangyo")?.workers || 0)}</td>
              <td>${formatPeople(rows.find(row => row.id === "okjeong")?.workers || 0)}</td>
            </tr>
          </tbody>
        </table>
        ${buildStatsBarRows(rows.flatMap(row => [
          { siteId: row.id, label: `${row.shortName} 인구`, value: row.population },
          { siteId: row.id, label: `${row.shortName} 종사자`, value: row.workers }
        ]), value => formatNumber(value, 0))}
      </article>
    `;

    container.innerHTML = transportCard + landUseCard + socioCard;
  }

  function buildSocioRows() {
    const transportSites = {
      pangyo: getTransportSite("pangyo"),
      okjeong: getTransportSite("okjeong")
    };

    return ["pangyo", "okjeong"].map(siteId => {
      const site = DATA.sites[siteId];
      const transport = transportSites[siteId];
      const iso30 = transport?.summary?.isochrones?.find(row => row.thresholdMinutes === 30) || {};
      const iso60 = transport?.summary?.isochrones?.find(row => row.thresholdMinutes === 60) || {};
      const population = Number(site.population || site.sgis?.areaWeightedPopulation || 0);
      const business = Number(site.businessAreaWeighted || site.sgis?.areaWeightedBusiness || 0);
      const workers = Number(site.workersAreaWeighted || site.sgis?.areaWeightedWorkers || 0);
      return {
        id: siteId,
        name: site.displayName,
        shortName: site.shortName,
        population,
        business,
        workers,
        jobsPerResident: population ? workers / population : 0,
        reachablePopulation30: Number(iso30.reachablePopulation || 0),
        reachableWorkers30: Number(iso30.reachableWorkers || 0),
        reachablePopulation60: Number(iso60.reachablePopulation || 0),
        reachableWorkers60: Number(iso60.reachableWorkers || 0),
        laborPoolRatio30: Number(iso30.reachablePopulation || 0)
          ? Number(iso30.reachableWorkers || 0) / Number(iso30.reachablePopulation || 1)
          : 0
      };
    });
  }

  function renderSocioOverview() {
    const container = document.getElementById("socio-overview-cards");
    if (!container) return;

    const rows = buildSocioRows();
    const cards = [
      {
        title: "구역 내부 총인구",
        key: "population",
        formatter: value => formatPeople(value),
        note: "집계구 총인구를 연구구역과의 교차면적 비율로 배분"
      },
      {
        title: "구역 내부 사업체 수",
        key: "business",
        formatter: value => `${formatNumber(value, 1)}개`,
        note: "SGIS 전국사업체조사 사업체수를 면적 비례 배분"
      },
      {
        title: "구역 내부 종사자 수",
        key: "workers",
        formatter: value => formatPeople(value),
        note: "SGIS 전국사업체조사 종사자수를 면적 비례 배분"
      }
    ];

    container.innerHTML = cards.map(card => {
      const leader = rows.reduce((best, row) => (!best || row[card.key] > best[card.key] ? row : best), null);
      return `
        <article class="comparison-card">
          <h3>${card.title}</h3>
          <div class="metric-rows">
            ${rows.map(row => `
              <div class="metric-row">
                <div class="label">${row.shortName}</div>
                <div class="value">${card.formatter(row[card.key])}</div>
              </div>
            `).join("")}
            <div class="metric-row metric-row--note">
              <div class="label">해석</div>
              <div class="value value--small">${leader.shortName}가 가장 큰 값으로 나타났습니다. ${card.note}</div>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderSocioMetricGrid() {
    const container = document.getElementById("socio-metric-grid");
    if (!container) return;

    const rows = buildSocioRows();
    const metrics = [
      {
        title: "구역 내부 규모 비교",
        items: [
          { key: "population", label: "상주인구", formatter: value => formatPeople(value) },
          { key: "business", label: "사업체", formatter: value => `${formatNumber(value, 1)}개` },
          { key: "workers", label: "종사자", formatter: value => formatPeople(value) }
        ]
      },
      {
        title: "직주 및 통근권 지표",
        items: [
          { key: "jobsPerResident", label: "직주비", formatter: value => `${formatNumber(value, 2)}` },
          { key: "reachableWorkers30", label: "30분 통근권 종사자", formatter: value => formatPeople(value) },
          { key: "laborPoolRatio30", label: "30분 통근권 종사자/인구", formatter: value => `${formatNumber(value, 3)}` }
        ]
      }
    ];

    container.innerHTML = metrics.map(group => {
      const allValues = group.items.flatMap(item => rows.map(row => row[item.key]));
      const maxValue = Math.max(...allValues, 0);
      return `
        <article class="panel analysis-panel">
          <div class="panel-top panel-top--compact">
            <div>
              <p class="section-kicker">Socio Metric</p>
              <h3>${group.title}</h3>
              <p>같은 축 위에서 두 대상지를 비교해 상대적인 차이를 읽을 수 있게 구성했습니다.</p>
            </div>
          </div>
          <div class="socio-bars">
            ${group.items.map(item => `
              <div class="socio-bar-group">
                <div class="socio-bar-group__head">
                  <strong>${item.label}</strong>
                </div>
                ${rows.map(row => {
                  const width = maxValue ? (row[item.key] / maxValue) * 100 : 0;
                  return `
                    <div class="socio-bar-row">
                      <div class="socio-bar-row__label">${row.shortName}</div>
                      <div class="socio-bar-track">
                        <div class="socio-bar-fill socio-bar-fill--${row.id}" style="width:${width}%;"></div>
                      </div>
                      <div class="socio-bar-row__value">${item.formatter(row[item.key])}</div>
                    </div>
                  `;
                }).join("")}
              </div>
            `).join("")}
          </div>
        </article>
      `;
    }).join("");
  }

  function renderSocioIndustryGrid() {
    const container = document.getElementById("socio-industry-grid");
    if (!container) return;

    container.innerHTML = ["pangyo", "okjeong"].map(siteId => {
      const site = DATA.sites[siteId];
      const industry = SOCIO_INDUSTRY[siteId];
      return `
        <article class="panel analysis-panel">
          <div class="panel-top panel-top--compact">
            <div>
              <p class="site-tag">${site.shortName}</p>
              <h3>${site.displayName} 상위 업종</h3>
              <p>사업체 수와 종사자 수 기준 상위 5개 업종 비중입니다.</p>
            </div>
          </div>
          <div class="socio-industry-columns">
            <div class="socio-industry-block">
              <h4>사업체 수 상위 5개</h4>
              ${industry.businessTop5.map((row, index) => `
                <div class="industry-row">
                  <div class="industry-row__rank">${index + 1}</div>
                  <div class="industry-row__body">
                    <div class="industry-row__top">
                      <strong>${row.name}</strong>
                      <span>${formatNumber(row.share, 1)}%</span>
                    </div>
                    <div class="industry-row__track">
                      <div class="industry-row__fill industry-row__fill--${siteId}" style="width:${row.share}%;"></div>
                    </div>
                    <div class="industry-row__meta">${formatNumber(row.value, 1)}개</div>
                  </div>
                </div>
              `).join("")}
            </div>
            <div class="socio-industry-block">
              <h4>종사자 수 상위 5개</h4>
              ${industry.workersTop5.map((row, index) => `
                <div class="industry-row">
                  <div class="industry-row__rank">${index + 1}</div>
                  <div class="industry-row__body">
                    <div class="industry-row__top">
                      <strong>${row.name}</strong>
                      <span>${formatNumber(row.share, 1)}%</span>
                    </div>
                    <div class="industry-row__track">
                      <div class="industry-row__fill industry-row__fill--${siteId}" style="width:${row.share}%;"></div>
                    </div>
                    <div class="industry-row__meta">${formatNumber(row.value, 1)}명</div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderSocioInterpretationGrid() {
    const container = document.getElementById("socio-interpretation-grid");
    if (!container) return;

    const rows = buildSocioRows();
    const pangyo = rows.find(row => row.id === "pangyo");
    const okjeong = rows.find(row => row.id === "okjeong");

    container.innerHTML = `
      <article class="panel analysis-panel">
        <div class="panel-top panel-top--compact">
          <div>
            <p class="section-kicker">Population Note</p>
            <h3>총인구 값 해석</h3>
            <p>작게 보이는 총인구 값은 실제 행정통계 인구가 아니라 분석경계 내부 추정치입니다.</p>
          </div>
        </div>
        <div class="socio-text-block">
          <p>
            판교의 총인구 ${formatPeople(pangyo.population)}와 옥정의 총인구 ${formatPeople(okjeong.population)}는
            SGIS 집계구 총인구를 연구구역과 집계구의 교차면적 비율로 배분한 추정값입니다.
            따라서 주민등록상 행정구역 인구가 아니라, 현재 설정한 분석경계 내부에 대응하는 추정 인구로 해석해야 합니다.
          </p>
        </div>
      </article>

      <article class="panel analysis-panel">
        <div class="panel-top panel-top--compact">
          <div>
            <p class="section-kicker">Work-Live Ratio</p>
            <h3>직주비 해석</h3>
            <p>직주비는 종사자 수를 상주인구로 나눈 값으로, 연구구역의 고용 중심성을 읽는 지표입니다.</p>
          </div>
        </div>
        <div class="socio-text-block">
          <p>
            판교의 직주비 ${formatNumber(pangyo.jobsPerResident, 2)}는 거주인구보다 종사자 규모가 훨씬 큰 업무 중심지 성격을 의미합니다.
            반면 옥정의 직주비 ${formatNumber(okjeong.jobsPerResident, 2)}는 자족용지 내부에서 고용 기능 형성이 아직 약하다는 뜻으로 해석할 수 있습니다.
          </p>
        </div>
      </article>

      <article class="panel analysis-panel">
        <div class="panel-top panel-top--compact">
          <div>
            <p class="section-kicker">Industry Read</p>
            <h3>업종 구성 해석</h3>
            <p>상위 업종 비중은 연구구역의 산업 성격과 자족기능의 질적 차이를 보여줍니다.</p>
          </div>
        </div>
        <div class="socio-text-block">
          <p>
            판교는 정보통신업과 전문, 과학 및 기술 서비스업 비중이 높아 지식기반 산업구조로 해석할 수 있습니다.
            옥정은 도소매업, 건설업, 제조업 등의 비중이 상대적으로 높아 판교보다 고부가 업무·연구 기능의 집적이 약한 구조로 보입니다.
          </p>
        </div>
      </article>

      <article class="panel analysis-panel">
        <div class="panel-top panel-top--compact">
          <div>
            <p class="section-kicker">Synthesis</p>
            <h3>인구사회 분석 종합 해석</h3>
            <p>총량과 업종 구조를 함께 보면 두 대상지의 자족기능 차이가 뚜렷합니다.</p>
          </div>
        </div>
        <div class="socio-text-block">
          <p>
            판교는 사업체와 종사자 규모가 크고 지식기반 업종 비중이 높아 자족기능이 강한 것으로 해석됩니다.
            반면 옥정은 사업체·종사자 규모가 작고 직주비도 낮아 자족기능이 아직 충분히 형성되지 않은 상태로 판단됩니다.
          </p>
        </div>
      </article>
    `;
  }

  function renderSocioMethodNote() {
    const container = document.getElementById("socio-method-note");
    if (!container) return;

    container.innerHTML = `
      <div class="section-note">
        <p class="section-desc">
          공간단위가 서로 다른 자료를 결합하기 위해 연구구역과 집계구가 겹치는 면적을 계산하고, 집계구 값에 교차면적 비율을 곱해 인구, 사업체, 종사자 수를 배분했습니다.
          직주비는 이렇게 산출한 구역 내 종사자 수를 구역 내 상주인구로 나눈 값입니다.
        </p>
        <p class="section-desc">
          통근권 지표는 철도 네트워크 기반 30분 등시권 안의 집계구 인구와 종사자를 합산한 보조지표입니다.
          현재 작업공간에 적재된 SGIS 범위 내에서만 집계했으므로 수도권 전체 노동시장 총량과 동일하게 해석하면 안 됩니다.
        </p>
      </div>
    `;
  }

  function getTransportSite(siteId) {
    return TRANSPORT_DATA?.sites?.[siteId] ?? null;
  }

  function placeTransportSectionAfterLandUse() {
    const transportAnchor = document.getElementById("transport-core-stations");
    const landUseAnchor = document.getElementById("zoning-grid");
    if (!transportAnchor || !landUseAnchor) return;

    const transportSection = transportAnchor.closest(".section");
    const landUseSection = landUseAnchor.closest(".section");
    if (!transportSection || !landUseSection || transportSection === landUseSection) return;
    landUseSection.insertAdjacentElement("afterend", transportSection);
  }

  function getIsochroneMetric(site, thresholdMinutes, key) {
    const row = site?.summary?.isochrones?.find(item => Number(item.thresholdMinutes) === Number(thresholdMinutes));
    return row ? Number(row[key] || 0) : 0;
  }

  function getTransportGrowth(site, key) {
    return Math.max(0, getIsochroneMetric(site, 60, key) - getIsochroneMetric(site, 30, key));
  }

  function getFeatureItems(geojson) {
    if (!geojson) return [];
    if (geojson.type === "FeatureCollection") return geojson.features || [];
    if (geojson.type === "Feature") return [geojson];
    return [{ type: "Feature", properties: {}, geometry: geojson }];
  }

  function forEachCoordinate(geometry, callback) {
    if (!geometry) return;
    if (geometry.type === "Point") {
      callback(geometry.coordinates);
      return;
    }
    const walk = coords => {
      if (typeof coords[0] === "number") {
        callback(coords);
        return;
      }
      coords.forEach(walk);
    };
    walk(geometry.coordinates);
  }

  function getBoundsForGeojson(geojson, extraPoints = []) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    getFeatureItems(geojson).forEach(feature => {
      forEachCoordinate(feature.geometry, ([x, y]) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      });
    });

    extraPoints.forEach(([x, y]) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });

    if (!Number.isFinite(minX)) {
      return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    }

    return { minX, minY, maxX, maxY };
  }

  function buildProjector(bounds, width, height, padding) {
    const dx = Math.max(bounds.maxX - bounds.minX, 0.000001);
    const dy = Math.max(bounds.maxY - bounds.minY, 0.000001);
    const scale = Math.min(
      (width - padding.left - padding.right) / dx,
      (height - padding.top - padding.bottom) / dy
    );
    const offsetX = padding.left + ((width - padding.left - padding.right) - dx * scale) / 2;
    const offsetY = padding.top + ((height - padding.top - padding.bottom) - dy * scale) / 2;

    return ([x, y]) => {
      const px = offsetX + (x - bounds.minX) * scale;
      const py = height - offsetY - (y - bounds.minY) * scale;
      return [px, py];
    };
  }

  function geometryToSvgPath(geometry, project) {
    if (!geometry) return "";
    if (geometry.type === "Polygon") {
      return geometry.coordinates.map(ring => ring.map((coord, index) => {
        const [x, y] = project(coord);
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      }).join(" ") + " Z").join(" ");
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates
        .map(polygon => geometryToSvgPath({ type: "Polygon", coordinates: polygon }, project))
        .join(" ");
    }
    return "";
  }

  function renderTransportInsights() {
    const container = document.getElementById("transport-core-stations");
    if (!container || !TRANSPORT_DATA?.sites) return;

    container.innerHTML = ["pangyo", "okjeong"].map(siteId => {
      const site = getTransportSite(siteId);
      const summary = site.summary;
      return `
        <article class="comparison-card comparison-card--insight">
          <h3>${summary.siteName} 분석 결과</h3>
          <div class="metric-rows">
            <div class="metric-row">
              <div class="label">핵심역</div>
              <div class="value value--small">${summary.coreStation.stationName}</div>
            </div>
            <div class="metric-row">
              <div class="label">30분 도달 종사자</div>
              <div class="value">${formatPeople(getIsochroneMetric(site, 30, "reachableWorkers"))}</div>
            </div>
            <div class="metric-row">
              <div class="label">60분까지 추가 종사자</div>
              <div class="value">${formatPeople(getTransportGrowth(site, "reachableWorkers"))}</div>
            </div>
            <div class="metric-row metric-row--note">
              <div class="label">의미</div>
              <div class="value value--small">${summary.coreStation.stationName}에서 30분 안에 닿는 종사자 수는 즉시 연결 가능한 노동시장 규모를 뜻하고, 60분까지의 증가분은 더 넓은 통근권 확장 폭을 뜻합니다.</div>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderTransportSummaryCards() {
    const container = document.getElementById("transport-summary-grid");
    if (!container || !TRANSPORT_DATA?.sites) return;

    const sites = ["pangyo", "okjeong"].map(siteId => ({
      site: getTransportSite(siteId)
    }));

    const cards = [
      { title: "30분 도달 종사자", key: "reachableWorkers", threshold: 30, formatter: formatPeople },
      { title: "60분 도달 종사자", key: "reachableWorkers", threshold: 60, formatter: formatPeople },
      { title: "30분 도달 인구", key: "reachablePopulation", threshold: 30, formatter: formatPeople }
    ];

    container.innerHTML = cards.map(card => {
      const rows = sites.map(({ site }) => ({
        label: site.summary.siteName,
        rawValue: getIsochroneMetric(site, card.threshold, card.key),
        value: card.formatter(getIsochroneMetric(site, card.threshold, card.key))
      }));
      const leader = rows.reduce((best, row) => (!best || row.rawValue > best.rawValue ? row : best), null);
      return `
        <article class="comparison-card">
          <h3>${card.title}</h3>
          <div class="metric-rows">
            ${rows.map(row => `
              <div class="metric-row">
                <div class="label">${row.label}</div>
                <div class="value">${row.value}</div>
              </div>
            `).join("")}
            <div class="metric-row metric-row--note">
              <div class="label">해석</div>
              <div class="value value--small">${leader.label} 쪽이 같은 시간대에 더 큰 접근가능권을 가집니다.</div>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  function getCurveMax(curves, key) {
    return Math.max(...curves.flatMap(curve => curve.map(row => Number(row[key] || 0))), 0);
  }

  function buildLinePath(rows, key, width, height, padding, maxValue) {
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    return rows.map((row, index) => {
      const x = padding.left + (innerWidth * index) / Math.max(rows.length - 1, 1);
      const y = padding.top + innerHeight - (innerHeight * Number(row[key] || 0)) / Math.max(maxValue, 1);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(" ");
  }

  function renderTransportCurve() {
    const container = document.getElementById("transport-curve-panel");
    if (!container || !TRANSPORT_DATA?.sites) return;

    const pangyo = getTransportSite("pangyo");
    const okjeong = getTransportSite("okjeong");
    const width = 920;
    const height = 300;
    const padding = { top: 18, right: 18, bottom: 34, left: 56 };
    const maxWorkers = getCurveMax([pangyo.cumulativeCurve, okjeong.cumulativeCurve], "reachableWorkers");
    const maxPopulation = getCurveMax([pangyo.cumulativeCurve, okjeong.cumulativeCurve], "reachablePopulation");

    container.innerHTML = `
      <div class="chart-head">
        <div>
          <p class="section-kicker">Cumulative Accessibility</p>
          <h3>누적 접근성 곡선</h3>
          <p>핵심역에서 출발해 t분 이내에 도달 가능한 인구와 종사자를 누적한 그래프입니다.</p>
        </div>
      </div>
      <div class="transport-curves">
        <div class="transport-curve-card">
          <h3>도달 종사자</h3>
          <svg viewBox="0 0 ${width} ${height}" class="transport-svg" role="img" aria-label="도달 종사자 누적 접근성 곡선">
            <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" class="transport-axis"></line>
            <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" class="transport-axis"></line>
            <path d="${buildLinePath(pangyo.cumulativeCurve, "reachableWorkers", width, height, padding, maxWorkers)}" class="transport-line transport-line--pangyo"></path>
            <path d="${buildLinePath(okjeong.cumulativeCurve, "reachableWorkers", width, height, padding, maxWorkers)}" class="transport-line transport-line--okjeong"></path>
            <text x="${padding.left}" y="${padding.top - 4}" class="transport-label">최대 ${formatPeople(maxWorkers)}</text>
            <text x="${width - padding.right}" y="${height - 8}" text-anchor="end" class="transport-label">60분</text>
          </svg>
        </div>
        <div class="transport-curve-card">
          <h3>도달 인구</h3>
          <svg viewBox="0 0 ${width} ${height}" class="transport-svg" role="img" aria-label="도달 인구 누적 접근성 곡선">
            <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" class="transport-axis"></line>
            <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" class="transport-axis"></line>
            <path d="${buildLinePath(pangyo.cumulativeCurve, "reachablePopulation", width, height, padding, maxPopulation)}" class="transport-line transport-line--pangyo"></path>
            <path d="${buildLinePath(okjeong.cumulativeCurve, "reachablePopulation", width, height, padding, maxPopulation)}" class="transport-line transport-line--okjeong"></path>
            <text x="${padding.left}" y="${padding.top - 4}" class="transport-label">최대 ${formatPeople(maxPopulation)}</text>
            <text x="${width - padding.right}" y="${height - 8}" text-anchor="end" class="transport-label">60분</text>
          </svg>
        </div>
      </div>
      <div class="transport-legend">
        <span><i class="transport-legend__swatch transport-legend__swatch--pangyo"></i>판교</span>
        <span><i class="transport-legend__swatch transport-legend__swatch--okjeong"></i>옥정</span>
      </div>
    `;
  }

  function renderTransportStationArea() {
    const container = document.getElementById("transport-station-area-grid");
    if (!container || !TRANSPORT_DATA?.sites) return;

    container.innerHTML = ["pangyo", "okjeong"].map(siteId => {
      const site = getTransportSite(siteId);
      const area500 = site.summary.stationAreaRatios.find(item => item.bufferMeters === 500);
      const area1000 = site.summary.stationAreaRatios.find(item => item.bufferMeters === 1000);

      return `
        <article class="panel analysis-panel">
          <div class="panel-top panel-top--compact">
            <div>
              <p class="site-tag">${site.summary.siteName}</p>
              <h3>역세권 면적 비율</h3>
              <p>분석구역 내부에서 역 반경 500m와 1km가 차지하는 비율입니다.</p>
            </div>
          </div>
          <div class="composition-legend">
            <div class="composition-legend__item">
              <span class="composition-legend__swatch" style="background:#1d4ed8;"></span>
              <strong>500m 역세권</strong>
              <span>${formatPercent(area500?.areaRatio || 0, 1)}</span>
            </div>
            <div class="composition-legend__item">
              <span class="composition-legend__swatch" style="background:#0f766e;"></span>
              <strong>1km 역세권</strong>
              <span>${formatPercent(area1000?.areaRatio || 0, 1)}</span>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderTransportMethodNote() {
    const container = document.getElementById("transport-method-note");
    if (!container || !TRANSPORT_DATA?.methods) return;

    const methods = TRANSPORT_DATA.methods;
    container.innerHTML = `
      <div class="caution-note">이 지도는 철도 노선도가 아니라 핵심역에서 출발한 30분권과 60분권을 읽기 쉽게 단순화한 도식입니다.</div>
      <p class="section-desc">지도 읽기: 진한 선은 업무지구 경계, 청록색은 30분권, 연한 파랑은 60분권, 검은 점은 핵심역입니다.</p>
      <p class="section-desc">지표 산정: ${methods.metricDefinition}</p>
      <p class="section-desc">해석 주의: ${methods.currentLimitation}</p>
    `;
  }

  function renderTransportMapFigure(siteId) {
    const transportSite = getTransportSite(siteId);
    const boundary = transformFeature(DATA.sites[siteId].boundary);
    const coreStations = transportSite.reachableStations.filter(station => Number(station.travelMinutes) === 0);
    const contextStations = transportSite.reachableStations
      .filter(station => Number(station.travelMinutes) <= 60)
      .slice(0, 240);
    const secondaryLabels = transportSite.reachableStations
      .filter(station => Number(station.travelMinutes) > 0 && Number(station.travelMinutes) <= 30)
      .slice(0, 18);
    const stationPoints = coreStations.map(station => [station.lng, station.lat]);
    const bounds60 = getBoundsForGeojson(transportSite.isochrone60, stationPoints);
    const boundsBoundary = getBoundsForGeojson(boundary, stationPoints);
    const combinedBounds = {
      minX: Math.min(bounds60.minX, boundsBoundary.minX),
      minY: Math.min(bounds60.minY, boundsBoundary.minY),
      maxX: Math.max(bounds60.maxX, boundsBoundary.maxX),
      maxY: Math.max(bounds60.maxY, boundsBoundary.maxY)
    };
    const width = 520;
    const height = 360;
    const project = buildProjector(combinedBounds, width, height, {
      top: 20,
      right: 20,
      bottom: 20,
      left: 20
    });

    const boundaryPath = getFeatureItems(boundary).map(feature => geometryToSvgPath(feature.geometry, project)).join(" ");
    const iso30Path = getFeatureItems(transportSite.isochrone30).map(feature => geometryToSvgPath(feature.geometry, project)).join(" ");
    const iso60Path = getFeatureItems(transportSite.isochrone60).map(feature => geometryToSvgPath(feature.geometry, project)).join(" ");
    const contextPolygonPaths = (transportSite.contextPolygons || [])
      .map(feature => geometryToSvgPath(feature.geometry, project))
      .join(" ");
    const contextDots = contextStations.map(station => {
      const [x, y] = project([station.lng, station.lat]);
      const radius = Number(station.travelMinutes) <= 30 ? 3.8 : 3;
      const className = Number(station.travelMinutes) <= 30
        ? "transport-context-dot transport-context-dot--near"
        : "transport-context-dot";
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius}" class="${className}"></circle>`;
    }).join("");
    const markers = coreStations.map(station => {
      const [x, y] = project([station.lng, station.lat]);
      return `
        <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="6" class="transport-station-dot"></circle>
        <text x="${(x + 10).toFixed(2)}" y="${(y - 10).toFixed(2)}" class="transport-station-label">${transportSite.summary.coreStation.stationName}</text>
      `;
    }).join("");
    const secondaryTexts = secondaryLabels.map((station, index) => {
      const [x, y] = project([station.lng, station.lat]);
      const dy = index % 2 === 0 ? 12 : -8;
      return `<text x="${(x + 6).toFixed(2)}" y="${(y + dy).toFixed(2)}" class="transport-secondary-label">${station.stationName}</text>`;
    }).join("");
    const coordLabels = `
      <text x="20" y="22" class="transport-coord-label">N ${combinedBounds.maxY.toFixed(3)}</text>
      <text x="${(width - 20).toFixed(2)}" y="22" text-anchor="end" class="transport-coord-label">E ${combinedBounds.maxX.toFixed(3)}</text>
      <text x="20" y="${(height - 10).toFixed(2)}" class="transport-coord-label">W ${combinedBounds.minX.toFixed(3)}</text>
      <text x="${(width - 20).toFixed(2)}" y="${(height - 10).toFixed(2)}" text-anchor="end" class="transport-coord-label">S ${combinedBounds.minY.toFixed(3)}</text>
    `;
    const gridLines = Array.from({ length: 5 }, (_, index) => {
      const x = 20 + ((width - 40) * index) / 4;
      const y = 20 + ((height - 40) * index) / 4;
      return `
        <line x1="${x.toFixed(2)}" y1="20" x2="${x.toFixed(2)}" y2="${(height - 20).toFixed(2)}" class="transport-grid-line"></line>
        <line x1="20" y1="${y.toFixed(2)}" x2="${(width - 20).toFixed(2)}" y2="${y.toFixed(2)}" class="transport-grid-line"></line>
      `;
    }).join("");
    const backgroundSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
        <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#e7eef4"/>
        ${gridLines.replaceAll('class="transport-grid-line"', 'stroke="rgba(15,23,42,0.06)" stroke-width="1"')}
        <path d="${contextPolygonPaths}" fill="rgba(148,163,184,0.12)" stroke="rgba(100,116,139,0.24)" stroke-width="0.8" vector-effect="non-scaling-stroke"></path>
        ${contextDots.replaceAll('class="transport-context-dot transport-context-dot--near"', 'fill="rgba(15,118,110,0.9)"').replaceAll('class="transport-context-dot"', 'fill="rgba(15,23,42,0.72)"')}
        ${secondaryTexts.replaceAll('class="transport-secondary-label"', 'fill="#334155" font-size="10" font-family="Pretendard, Noto Sans KR, sans-serif"')}
        ${coordLabels.replaceAll('class="transport-coord-label"', 'fill="#64748b" font-size="10" font-family="JetBrains Mono, monospace"')}
      </svg>
    `;
    const backgroundHref = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(backgroundSvg)}`;

    return `
      <svg viewBox="0 0 ${width} ${height}" class="transport-map-svg" role="img" aria-label="${transportSite.summary.coreStation.stationName} 중심 등시간권 도식">
        <image href="${backgroundHref}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"></image>
        <path d="${boundaryPath}" class="transport-shape transport-shape--boundary"></path>
        <path d="${iso60Path}" class="transport-shape transport-shape--60"></path>
        <path d="${iso30Path}" class="transport-shape transport-shape--30"></path>
        ${markers}
      </svg>
    `;
  }

  function renderTransportIsochroneGrid() {
    const container = document.getElementById("transport-isochrone-grid");
    if (!container || !TRANSPORT_DATA?.sites) return;

    container.innerHTML = ["pangyo", "okjeong"].map(siteId => {
      const site = getTransportSite(siteId);
      return `
        <article class="panel site-panel">
          <div class="panel-top">
            <div>
              <p class="site-tag">${site.summary.siteName}</p>
              <h3>${site.summary.coreStation.stationName} 중심 등시간권</h3>
              <p>업무지구 경계와 핵심역 기준 30분권, 60분권의 퍼짐 방향을 정적으로 표현한 도식입니다.</p>
            </div>
            <span class="badge">OSM Base</span>
          </div>
          <div class="transport-map-wrap">
            <div id="${siteId}-transport-map" class="map transport-map" role="img" aria-label="${site.summary.coreStation.stationName} 등시간권 지도"></div>
          </div>
          <div class="transport-legend transport-legend--map">
            <span><i class="transport-legend__swatch transport-legend__swatch--30"></i>30분권</span>
            <span><i class="transport-legend__swatch transport-legend__swatch--60"></i>60분권</span>
            <span><i class="transport-legend__swatch transport-legend__swatch--boundary"></i>업무지구 경계</span>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderTransportIsochroneGridStatic() {
    const container = document.getElementById("transport-isochrone-grid");
    if (!container || !TRANSPORT_DATA?.sites) return;

    container.innerHTML = ["pangyo", "okjeong"].map(siteId => {
      const site = getTransportSite(siteId);
      return `
        <article class="panel site-panel">
          <div class="panel-top">
            <div>
              <p class="site-tag">${site.summary.siteName}</p>
              <h3>${site.summary.coreStation.stationName} 중심 등시간권</h3>
              <p>업무지구 경계와 지하철 30분, 60분 도달 범위를 같은 투영 기준으로 겹쳐 보여주는 정적 지도입니다.</p>
            </div>
            <span class="badge">Static Base</span>
          </div>
          <div class="transport-map-wrap">
            ${renderTransportMapFigure(siteId)}
          </div>
          <div class="transport-legend transport-legend--map">
            <span><i class="transport-legend__swatch transport-legend__swatch--30"></i>30분</span>
            <span><i class="transport-legend__swatch transport-legend__swatch--60"></i>60분</span>
            <span><i class="transport-legend__swatch transport-legend__swatch--boundary"></i>업무지구 경계</span>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderTransportInteractiveGrid() {
    const container = document.getElementById("transport-isochrone-grid");
    if (!container || !TRANSPORT_DATA?.sites) return;

    container.innerHTML = ["pangyo", "okjeong"].map(siteId => {
      const site = getTransportSite(siteId);
      const thirty = site.summary.isochrones.find(row => row.thresholdMinutes === 30);
      return `
        <article class="panel site-panel">
          <div class="panel-top">
            <div>
              <p class="site-tag">${site.summary.siteName}</p>
              <h3>${site.summary.coreStation.stationName} 중심 등시간권</h3>
              <p>30분, 60분, 전체 보기를 전환해 도달 범위와 도달 가능 인구·종사자 규모를 확인할 수 있습니다.</p>
            </div>
            <span class="badge">Interactive</span>
          </div>
          <div class="transport-map-wrap">
            <div class="transport-mode-switch" data-site-id="${siteId}">
              <button type="button" class="transport-mode-switch__button is-active" data-mode="both">30·60분</button>
              <button type="button" class="transport-mode-switch__button" data-mode="30">30분</button>
              <button type="button" class="transport-mode-switch__button" data-mode="60">60분</button>
            </div>
            <div id="${siteId}-transport-map-interactive" class="map transport-map" role="img" aria-label="${site.summary.coreStation.stationName} 등시간권 지도"></div>
            <div class="transport-mode-stats" id="${siteId}-transport-stats">
              <div class="transport-mode-stats__item">
                <strong>기본 보기</strong>
                <span>30분 인구 ${formatPeople(thirty?.reachablePopulation || 0)} / 종사자 ${formatPeople(thirty?.reachableWorkers || 0)}</span>
              </div>
            </div>
          </div>
          <div class="transport-legend transport-legend--map">
            <span><i class="transport-legend__swatch transport-legend__swatch--30"></i>30분</span>
            <span><i class="transport-legend__swatch transport-legend__swatch--60"></i>60분</span>
            <span><i class="transport-legend__swatch transport-legend__swatch--boundary"></i>연구구역 경계</span>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderTransportInteractiveMap(siteId) {
    const containerId = `${siteId}-transport-map-interactive`;
    const container = document.getElementById(containerId);
    const transportSite = getTransportSite(siteId);
    const site = DATA?.sites?.[siteId];
    if (!container || !transportSite || !site) return;
    if (!window.L) {
      container.innerHTML = renderTransportMapFigure(siteId);
      return;
    }

    try {

    const map = L.map(containerId, {
      zoomControl: true,
      scrollWheelZoom: false,
      preferCanvas: true
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    const boundaryLayer = L.geoJSON(transformFeature(site.boundary), {
      style: {
        color: "#0f172a",
        weight: 2.4,
        fillColor: "#f4e2a8",
        fillOpacity: 0.28
      }
    }).addTo(map);

    const iso60Layer = L.geoJSON(transportSite.isochrone60, {
      style: {
        color: "#3b82f6",
        weight: 1.8,
        fillColor: "#93c5fd",
        fillOpacity: 0.28
      }
    });

    const iso30Layer = L.geoJSON(transportSite.isochrone30, {
      style: {
        color: "#0f766e",
        weight: 2,
        fillColor: "#5eead4",
        fillOpacity: 0.34
      }
    });

    const coreStations = transportSite.reachableStations.filter(
      station => Number(station.travelMinutes) === 0
    );

    coreStations.forEach((station) => {
      const marker = L.circleMarker([station.lat, station.lng], {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: "#ef4444",
        fillOpacity: 1
      }).addTo(map);

      marker.bindTooltip(
        transportSite.summary.coreStation.stationName,
        { direction: "top", offset: [0, -8], permanent: true, opacity: 0.92 }
      );
    });

    const buttonWrap = document.querySelector(`.transport-mode-switch[data-site-id="${siteId}"]`);
    const buttons = buttonWrap ? [...buttonWrap.querySelectorAll(".transport-mode-switch__button")] : [];
    const stats = document.getElementById(`${siteId}-transport-stats`);
    const summaryByMode = {
      "30": transportSite.summary.isochrones.find(row => row.thresholdMinutes === 30),
      "60": transportSite.summary.isochrones.find(row => row.thresholdMinutes === 60),
      both: transportSite.summary.isochrones.find(row => row.thresholdMinutes === 60)
    };

    function setMode(mode) {
      if (map.hasLayer(iso30Layer)) map.removeLayer(iso30Layer);
      if (map.hasLayer(iso60Layer)) map.removeLayer(iso60Layer);

      if (mode === "30") {
        iso30Layer.addTo(map);
      } else if (mode === "60") {
        iso60Layer.addTo(map);
      } else {
        iso60Layer.addTo(map);
        iso30Layer.addTo(map);
      }

      buttons.forEach(button => {
        button.classList.toggle("is-active", button.dataset.mode === mode);
      });

      const summary = summaryByMode[mode] || summaryByMode.both;
      if (stats && summary) {
        stats.innerHTML = `
          <div class="transport-mode-stats__item">
            <strong>${mode === "both" ? "30·60분 전체" : `${mode}분 선택`}</strong>
            <span>도달 인구 ${formatPeople(summary.reachablePopulation || 0)} / 도달 종사자 ${formatPeople(summary.reachableWorkers || 0)}</span>
          </div>
        `;
      }
    }

    buttons.forEach(button => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });

    const fitTarget = L.featureGroup([boundaryLayer, iso60Layer]);
    map.fitBounds(fitTarget.getBounds().pad(0.1));
    setMode("both");
    setTimeout(() => map.invalidateSize(), 0);
    } catch (error) {
      container.innerHTML = renderTransportMapFigure(siteId);
      const stats = document.getElementById(`${siteId}-transport-stats`);
      const summary60 = transportSite.summary.isochrones.find(row => row.thresholdMinutes === 60);
      if (stats && summary60) {
        stats.innerHTML = `
          <div class="transport-mode-stats__item">
            <strong>정적 대체 지도</strong>
            <span>60분 도달 인구 ${formatPeople(summary60.reachablePopulation || 0)} / 60분 도달 종사자 ${formatPeople(summary60.reachableWorkers || 0)}</span>
          </div>
        `;
      }
      console.error("transport map fallback", siteId, error);
    }
  }

  function summarizeBuildingUseRows(rows) {
    return Object.entries(
      rows.reduce((sites, row) => {
        const siteId = row.siteId;
        if (!sites[siteId]) sites[siteId] = [];
        sites[siteId].push({
          name: row.mainUse,
          share: Number(row.grossFloorAreaShare || 0) * 100
        });
        return sites;
      }, {})
    ).reduce((sites, [siteId, siteRows]) => {
      const sortedRows = [...siteRows].sort((a, b) => b.share - a.share);
      const topRows = sortedRows.slice(0, 2);
      const otherShare = sortedRows.slice(2).reduce((sum, row) => sum + row.share, 0);
      sites[siteId] = [
        ...topRows.map((row, index) => ({ ...row, color: BUILDING_USE_COLORS[index] })),
        { name: "기타", share: otherShare, color: BUILDING_USE_COLORS[2] }
      ];
      return sites;
    }, {});
  }

  function renderDevelopmentRealization() {
    const container = document.getElementById("development-realization");
    if (!container) return;

    container.innerHTML = Object.values(DATA.sites).map(site => {
      const unbuiltShare = Number(site.unbuiltParcelRatioArea || 0) * 100;
      const realizedShare = Math.max(0, 100 - unbuiltShare);
      const interpretation = site.id === "pangyo"
        ? "판교는 개발 완료 면적 비중이 높아 상대적으로 개발 실현 정도가 높게 나타난다."
        : "옥정은 미개발 면적 비중이 커서 추가 개발 여지가 상대적으로 크게 남아 있다.";

      return `
        <article class="panel analysis-panel">
          <div class="panel-top panel-top--compact">
            <div>
              <p class="site-tag">${site.shortName}</p>
              <h3>${site.displayName}</h3>
              <p>개발 완료 면적과 미개발 면적의 상대 비율</p>
            </div>
          </div>
          <div class="stacked-bar" aria-label="${site.shortName} 개발 실현 정도">
            <div class="stacked-bar__segment" style="left:0;width:${realizedShare}%;background:#2563eb;"></div>
            <div class="stacked-bar__segment" style="left:${realizedShare}%;width:${unbuiltShare}%;background:#cbd5e1;"></div>
          </div>
          <div class="composition-legend">
            <div class="composition-legend__item">
              <span class="composition-legend__swatch" style="background:#2563eb;"></span>
              <strong>개발 완료 면적</strong>
              <span>${formatNumber(realizedShare, 1)}%</span>
            </div>
            <div class="composition-legend__item">
              <span class="composition-legend__swatch" style="background:#cbd5e1;"></span>
              <strong>미개발 면적</strong>
              <span>${formatNumber(unbuiltShare, 1)}%</span>
            </div>
          </div>
          <p class="composition-note">${interpretation}</p>
        </article>
      `;
    }).join("");
  }

  function renderLandUseMix() {
    const container = document.getElementById("land-use-mix");
    if (!container) return;

    container.innerHTML = Object.values(DATA.sites).map(site => {
      const mixScore = Number(site.lumEntropyFloorAreaNormalized || 0) * 100;
      const interpretation = site.id === "pangyo"
        ? "판교는 업무와 연구 기능이 함께 분포해 용도 혼합도가 상대적으로 높게 나타난다."
        : "옥정은 특정 용도 비중이 커서 용도 혼합도가 상대적으로 낮게 나타난다.";

      return `
        <article class="panel analysis-panel">
          <div class="panel-top panel-top--compact">
            <div>
              <p class="site-tag">${site.shortName}</p>
              <h3>${site.displayName}</h3>
              <p>연면적 기준 정규화 엔트로피</p>
            </div>
            <span class="badge">${formatNumber(mixScore, 1)} / 100</span>
          </div>
          <div class="mix-meter" aria-label="${site.shortName} 토지이용 혼합도">
            <div class="mix-meter__fill" style="width:${mixScore}%;"></div>
          </div>
          <p class="composition-note">${interpretation}</p>
        </article>
      `;
    }).join("");
  }

  function renderBuildingUseComposition() {
    const container = document.getElementById("building-use-composition");
    if (!container || !BUILDING_USE_DATA || !Array.isArray(BUILDING_USE_DATA.rows)) return;

    const compositionBySite = summarizeBuildingUseRows(BUILDING_USE_DATA.rows);

    container.innerHTML = `
      <div class="use-composition-grid">
        ${Object.entries(compositionBySite).map(([siteId, items]) => {
          const site = DATA.sites[siteId];
          const totalShare = items.reduce((sum, item) => sum + item.share, 0) || 100;
          let offset = 0;
          const segments = items.map(item => {
            const normalizedShare = (item.share / totalShare) * 100;
            const segment = `
              <div
                class="stacked-bar__segment"
                style="left:${offset}%;width:${normalizedShare}%;background:${item.color};"
                title="${site.shortName} ${item.name} ${formatNumber(item.share, 1)}%"
              ></div>
            `;
            offset += normalizedShare;
            return segment;
          }).join("");

          return `
            <article class="panel composition-panel">
              <div class="panel-top panel-top--compact">
                <div>
                  <p class="site-tag">${site.shortName}</p>
                  <h3>${site.displayName}</h3>
                  <p>연면적 비율 100% 기준 구성</p>
                </div>
              </div>
              <div class="stacked-bar" aria-label="${site.shortName} 건물 용도 구성비">
                ${segments}
              </div>
              <div class="composition-legend">
                ${items.map(item => `
                  <div class="composition-legend__item">
                    <span class="composition-legend__swatch" style="background:${item.color};"></span>
                    <strong>${item.name}</strong>
                    <span>${formatNumber(item.share, 1)}%</span>
                  </div>
                `).join("")}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderZoning() {
    const container = document.getElementById("zoning-grid");
    if (!container) return;

    container.innerHTML = Object.values(DATA.sites).map(site => `
      <article class="panel site-panel">
        <div class="panel-top">
          <div>
            <p class="site-tag">${site.shortName}</p>
            <h3>${site.displayName}</h3>
            <p>법정 용도지역 CSV 기반 보조 추정</p>
          </div>
          <span class="badge">Approx.</span>
        </div>
        <div class="site-meta site-meta--zoning">
          <div class="mini-stat">
            <strong>커버 필지</strong>
            <span>${formatNumber(site.zoningCoverage?.coveredParcelCount || 0)}개</span>
          </div>
          <div class="mini-stat">
            <strong>미포함 필지</strong>
            <span>${formatNumber(site.zoningCoverage?.uncoveredParcelCount || 0)}개</span>
          </div>
          <div class="mini-stat">
            <strong>대상 면적</strong>
            <span>${formatArea(site.zoningCoverage?.totalIntersectionAreaSqm || 0)}</span>
          </div>
        </div>
        <div class="zoning-list">
          ${site.zoning.map(zone => `
            <div class="zoning-row">
              <div>
                <strong>${zone.name}</strong>
                <span>${formatArea(zone.areaSqm)}</span>
              </div>
              <div class="zoning-share">${formatPercent(zone.share, 1)}</div>
            </div>
          `).join("")}
        </div>
      </article>
    `).join("");
  }

  function addLegend(map, sections) {
    const legend = L.control({ position: "bottomright" });
    legend.onAdd = () => {
      const div = L.DomUtil.create("div", "map-legend");
      div.innerHTML = sections.map(section => `
        <strong>${section.title}</strong>
        ${Object.entries(section.colorMap).map(([label, color]) => `
          <div class="map-legend__row">
            <span class="map-legend__swatch" style="background:${color};"></span>
            <span>${escapeHtml(label)}</span>
          </div>
        `).join("")}
      `).join("");
      return div;
    };
    legend.addTo(map);
  }

  function addBuildingUseLegend(map, title, colorMap) {
    addLegend(map, [{ title, colorMap }]);
  }

  function addBuildingMarkers(map, siteId, colorMap) {
    const layerSite = getMapLayerSite(siteId);
    if (!layerSite?.rows?.length) return null;
    const group = L.layerGroup();

    layerSite.rows.forEach(row => {
      const marker = L.circleMarker([row.centroidLat, row.centroidLon], {
        radius: 6,
        color: "#ffffff",
        weight: 1.5,
        fillColor: colorMap[row.mainUse] || "#475569",
        fillOpacity: 0.92
      });

      marker.bindPopup(`
        <div class="map-popup">
          <strong>${escapeHtml(row.mainUse)}</strong>
          <div>연면적: ${formatArea(row.grossFloorAreaSqm || 0)}</div>
          <div>용적률: ${row.parcelFarPercent != null ? `${formatNumber(row.parcelFarPercent, 1)}%` : "N/A"}</div>
          <div>승인연도: ${row.approvalYear || "N/A"}</div>
          <div>PNU: ${escapeHtml(row.pnu || "")}</div>
        </div>
      `);

      group.addLayer(marker);
    });

    group.addTo(map);
    addBuildingUseLegend(map, "건축물 주용도", colorMap);
    return group;
  }

  function addParcelLayer(siteId, colorMap) {
    const layerSite = getMapLayerSite(siteId);
    if (!layerSite?.parcelFeatures?.length) return null;

    return L.geoJSON(layerSite.parcelFeatures.map(transformFeature), {
      style: feature => ({
        color: "#475569",
        weight: 1,
        fillColor: colorMap[feature.properties.primaryZoning] || "#94a3b8",
        fillOpacity: 0.28
      }),
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        layer.bindPopup(`
          <div class="map-popup">
            <strong>${escapeHtml(props.parcelJibun || props.pnu || "필지")}</strong>
            <div>추정 용도지역 ${escapeHtml(props.primaryZoning || "미상")}</div>
            <div>필지면적 ${formatArea(props.parcelAreaSqm || 0)}</div>
            <div>건축물 수 ${formatNumber(props.buildingCount || 0)}개</div>
            <div>연면적 ${formatArea(props.grossFloorAreaSqm || 0)}</div>
            <div>필지 용적률 ${props.parcelFarPercent != null ? `${formatNumber(props.parcelFarPercent, 1)}%` : "N/A"}</div>
            <div>대표 주용도 ${escapeHtml(props.primaryBuildingUse || "미상")}</div>
            <div>PNU ${escapeHtml(props.pnu || "")}</div>
          </div>
        `);
      }
    });
  }

  function applyMapCompareLayout() {
    const grid = document.getElementById("primary-map-grid");
    const siteButtons = [...document.querySelectorAll("#map-site-toggle .segmented-control__button")];
    if (!grid) return;

    grid.classList.toggle("map-grid--single", MAP_COMPARE_STATE.layout === "single");
    ["pangyo", "okjeong"].forEach(siteId => {
      const panel = document.getElementById(`${siteId}-map-panel`);
      if (!panel) return;
      panel.classList.toggle(
        "is-hidden",
        MAP_COMPARE_STATE.layout === "single" && MAP_COMPARE_STATE.activeSiteId !== siteId
      );
    });

    siteButtons.forEach(button => {
      button.classList.toggle("is-active", button.dataset.site === MAP_COMPARE_STATE.activeSiteId);
      button.disabled = MAP_COMPARE_STATE.layout === "split";
    });

    Object.values(MAP_INSTANCES).forEach(instance => {
      setTimeout(() => instance.map.invalidateSize(), 0);
    });
  }

  function bindMapCompareControls() {
    const layoutButtons = [...document.querySelectorAll("#map-layout-toggle .segmented-control__button")];
    const siteButtons = [...document.querySelectorAll("#map-site-toggle .segmented-control__button")];

    layoutButtons.forEach(button => {
      button.addEventListener("click", () => {
        MAP_COMPARE_STATE.layout = button.dataset.layout;
        layoutButtons.forEach(item => item.classList.toggle("is-active", item === button));
        applyMapCompareLayout();
      });
    });

    siteButtons.forEach(button => {
      button.addEventListener("click", () => {
        MAP_COMPARE_STATE.activeSiteId = button.dataset.site;
        siteButtons.forEach(item => item.classList.toggle("is-active", item === button));
        applyMapCompareLayout();
      });
    });

    applyMapCompareLayout();
  }

  function renderMap(site) {
    const containerId = `${site.id}-map`;
    const transformedBoundary = transformFeature(site.boundary);
    const layerSite = getMapLayerSite(site.id);
    const map = L.map(containerId, {
      zoomControl: true,
      scrollWheelZoom: false,
      preferCanvas: true
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    const layer = L.geoJSON(transformedBoundary, {
      style: {
        color: SITE_THEME[site.id].border,
        weight: 2.5,
        fillColor: SITE_THEME[site.id].fill,
        fillOpacity: 0.2
      }
    }).addTo(map);

    const buildingColorMap = buildUseColorMap(layerSite?.mainUses || []);
    const zoningColorMap = buildZoningColorMap(layerSite?.zoningCategories || []);
    const parcelLayer = addParcelLayer(site.id, zoningColorMap);
    const buildingMarkers = addBuildingMarkers(map, site.id, buildingColorMap);
    if (buildingMarkers) {
      L.control.layers(
        {},
        { "건축물 주용도": buildingMarkers },
        { collapsed: false, position: "topleft" }
      ).addTo(map);
    }
    if (parcelLayer) {
      parcelLayer.addTo(map);
      addLegend(map, [{ title: "필지 용도지역", colorMap: zoningColorMap }]);
    }

    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.15));
    setTimeout(() => map.invalidateSize(), 0);
    MAP_INSTANCES[site.id] = { map };
    renderMeta(site);
  }

  function renderTransportMap(siteId) {
    const containerId = `${siteId}-transport-map`;
    const container = document.getElementById(containerId);
    const transportSite = getTransportSite(siteId);
    const site = DATA?.sites?.[siteId];
    if (!container || !transportSite || !site || !window.L) return;

    const map = L.map(containerId, {
      zoomControl: true,
      scrollWheelZoom: false,
      preferCanvas: true
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    const boundaryLayer = L.geoJSON(transformFeature(site.boundary), {
      style: {
        color: "#0f172a",
        weight: 2.4,
        fillColor: "#f4e2a8",
        fillOpacity: 0.28
      }
    }).addTo(map);

    const iso60Layer = L.geoJSON(transportSite.isochrone60, {
      style: {
        color: "#3b82f6",
        weight: 1.8,
        fillColor: "#93c5fd",
        fillOpacity: 0.28
      }
    }).addTo(map);

    const iso30Layer = L.geoJSON(transportSite.isochrone30, {
      style: {
        color: "#0f766e",
        weight: 2,
        fillColor: "#5eead4",
        fillOpacity: 0.34
      }
    }).addTo(map);

    const coreStations = transportSite.reachableStations.filter(
      (station) => Number(station.travelMinutes) === 0
    );

    coreStations.forEach((station) => {
      const marker = L.circleMarker([station.lat, station.lng], {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: "#ef4444",
        fillOpacity: 1
      }).addTo(map);

      marker.bindTooltip(
        transportSite.summary.coreStation.stationName,
        { direction: "top", offset: [0, -8], permanent: true, opacity: 0.92 }
      );
    });

    const focusBounds = iso30Layer.getBounds();
    const fallbackBounds = iso60Layer.getBounds();
    const boundaryBounds = boundaryLayer.getBounds();

    if (focusBounds.isValid()) {
      map.fitBounds(focusBounds.extend(boundaryBounds).pad(0.12));
    } else if (fallbackBounds.isValid()) {
      map.fitBounds(fallbackBounds.extend(boundaryBounds).pad(0.1));
    } else if (boundaryBounds.isValid()) {
      map.fitBounds(boundaryBounds.pad(0.18));
    } else if (coreStations[0]) {
      map.setView([coreStations[0].lat, coreStations[0].lng], 12);
    }

    setTimeout(() => map.invalidateSize(), 0);
  }

  function render() {
    if (!DATA || !DATA.sites) return;

    placeTransportSectionAfterLandUse();

    if (window.L) {
      renderMap(DATA.sites.pangyo);
      renderMap(DATA.sites.okjeong);
      bindMapCompareControls();
    }

    renderComparison();
    renderStatsPanel();
    renderSocioOverview();
    renderSocioMetricGrid();
    renderSocioIndustryGrid();
    renderSocioInterpretationGrid();
    renderSocioMethodNote();
    renderBuildingUseComposition();
    renderDevelopmentRealization();
    renderLandUseMix();
    renderZoning();
    renderTransportInsights();
    renderTransportInteractiveGrid();
    if (window.L) {
      renderTransportInteractiveMap("pangyo");
      renderTransportInteractiveMap("okjeong");
    }
    renderTransportSummaryCards();
    renderTransportCurve();
    renderTransportStationArea();
    renderTransportMethodNote();
  }

  window.addEventListener("DOMContentLoaded", render);
})();
