(function () {
  const data = window.__SONGPA_LANDUSE_DATA__;
  if (!data) return;

  const state = {
    layerMode: "parcel_use",
    selectedDong: "ALL",
    selectedUse: "ALL",
    searchTerm: "",
    selectedParcel: null,
    selectedOa: null,
    view: null,
    dragging: false,
    dragStart: null,
  };

  const canvas = document.getElementById("parcelCanvas");
  const ctx = canvas.getContext("2d");
  const layerModeEl = document.getElementById("layerMode");
  const dongFilterEl = document.getElementById("dongFilter");
  const useFilterEl = document.getElementById("useFilter");
  const searchInputEl = document.getElementById("searchInput");
  const resetViewBtn = document.getElementById("resetViewBtn");

  state.view = fitView(computeWorldBounds(data.parcels), canvas.width, canvas.height);

  populateSelect(
    dongFilterEl,
    ["ALL", ...uniqueSorted(data.parcels.map((feature) => feature.dongName).filter(Boolean))]
  );
  populateSelect(useFilterEl, ["ALL", ...data.parcelStats.useRows.map((row) => row.label)]);

  fillMeta();
  fillNotices();
  fillSummary();
  renderTables();
  updateUiText();
  bindEvents();
  redraw();

  function bindEvents() {
    layerModeEl.addEventListener("change", () => {
      state.layerMode = layerModeEl.value;
      state.selectedParcel = null;
      state.selectedOa = null;
      updateUiText();
      redraw();
    });

    dongFilterEl.addEventListener("change", () => {
      state.selectedDong = dongFilterEl.value;
      state.selectedParcel = null;
      redraw();
    });

    useFilterEl.addEventListener("change", () => {
      state.selectedUse = useFilterEl.value;
      state.selectedParcel = null;
      redraw();
    });

    searchInputEl.addEventListener("input", () => {
      state.searchTerm = searchInputEl.value.trim();
      state.selectedParcel = null;
      redraw();
    });

    resetViewBtn.addEventListener("click", () => {
      state.view = fitView(computeWorldBounds(data.parcels), canvas.width, canvas.height);
      redraw();
    });

    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const zoomFactor = event.deltaY < 0 ? 1.16 : 0.86;
      const before = screenToWorld(event.offsetX, event.offsetY, state.view);
      state.view.scale *= zoomFactor;
      const after = screenToWorld(event.offsetX, event.offsetY, state.view);
      state.view.offsetX += (after.x - before.x) * state.view.scale;
      state.view.offsetY -= (after.y - before.y) * state.view.scale;
      redraw();
    });

    canvas.addEventListener("mousedown", (event) => {
      state.dragging = true;
      state.dragStart = {
        x: event.offsetX,
        y: event.offsetY,
        view: { ...state.view },
      };
    });

    window.addEventListener("mouseup", () => {
      state.dragging = false;
      state.dragStart = null;
    });

    canvas.addEventListener("mousemove", (event) => {
      if (!state.dragging || !state.dragStart) return;
      state.view.offsetX = state.dragStart.view.offsetX + (event.offsetX - state.dragStart.x);
      state.view.offsetY = state.dragStart.view.offsetY + (event.offsetY - state.dragStart.y);
      redraw();
    });

    canvas.addEventListener("click", (event) => {
      const point = screenToWorld(event.offsetX, event.offsetY, state.view);
      if (state.layerMode === "oa_population" || state.layerMode === "oa_household") {
        state.selectedOa = pickFeature(point.x, point.y, data.oaBoundaries);
        state.selectedParcel = null;
      } else {
        state.selectedParcel = pickFeature(point.x, point.y, getFilteredParcels());
        state.selectedOa = null;
      }
      redraw();
    });
  }

  function fillMeta() {
    document.getElementById("metaCard").innerHTML = `
      <dl>
        <dt>Area</dt><dd>${data.meta.area}</dd>
        <dt>Parcel</dt><dd>${data.meta.dates.parcel}</dd>
        <dt>Building GIS</dt><dd>${data.meta.dates.buildingGis}</dd>
        <dt>Zoning</dt><dd>${data.meta.dates.zoning}</dd>
        <dt>Ledger</dt><dd>${data.meta.dates.buildingLedger}</dd>
        <dt>Census</dt><dd>${data.meta.dates.census}</dd>
      </dl>
    `;
  }

  function fillNotices() {
    document.getElementById("noticeList").innerHTML = `
      <ul>${data.meta.notes.map((note) => `<li>${note}</li>`).join("")}</ul>
    `;
  }

  function fillSummary() {
    const stats = data.parcelStats.summary;
    const cards = [
      ["Total Parcels", formatInt(stats.totalParcels), "Songpa parcel layer"],
      [
        "Building Parcels",
        formatInt(stats.buildingParcelCount),
        formatPercent(stats.buildingParcelCount / Math.max(stats.totalParcels, 1)),
      ],
      ["Total Floor Area", `${formatInt(stats.totalFloorArea)} sq.m`, "Parcel building floor area"],
      ["Zoning Classes", formatInt(data.parcelStats.zoningRows.length), "Representative zoning"],
      ["Total Population", formatInt(data.census.summary.totalPopulation), "OA census 2024"],
      [
        "Total Households",
        formatInt(data.census.summary.totalHouseholds),
        `PPH ${data.census.summary.personsPerHousehold}`,
      ],
    ];

    document.getElementById("summaryGrid").innerHTML = cards
      .map(
        ([title, value, note]) => `
          <article>
            <h3>${title}</h3>
            <strong>${value}</strong>
            <span>${note}</span>
          </article>
        `
      )
      .join("");
  }

  function renderTables() {
    renderTable(
      document.getElementById("useTable"),
      ["Main Use", "Parcels", "Share", "Floor Area", "Area Share", "Units"],
      data.parcelStats.useRows.map((row) => [
        row.label,
        formatInt(row.parcelCount),
        `${row.parcelShare}%`,
        `${formatInt(row.floorArea)} sq.m`,
        `${row.floorAreaShare}%`,
        formatInt(row.units || 0),
      ])
    );

    renderTable(
      document.getElementById("zoningTable"),
      ["Zoning", "Parcels", "Share", "Floor Area", "Area Share"],
      data.parcelStats.zoningRows.map((row) => [
        row.label,
        formatInt(row.parcelCount),
        `${row.parcelShare}%`,
        `${formatInt(row.floorArea)} sq.m`,
        `${row.floorAreaShare}%`,
      ])
    );

    renderTable(
      document.getElementById("dongTable"),
      ["Dong", "Parcels", "Building Parcels", "Floor Area", "Households"],
      data.parcelStats.dongRows.map((row) => [
        row.label,
        formatInt(row.parcelCount),
        `${formatInt(row.buildingParcelCount)} (${row.buildingParcelShare}%)`,
        `${formatInt(row.floorArea)} sq.m`,
        formatInt(row.households),
      ])
    );

    renderTable(
      document.getElementById("censusPopTable"),
      ["OA Code", "Population", "Households", "PPH"],
      data.census.topPopulation.map((row) => [
        row.oaCode,
        formatInt(row.totalPopulation),
        formatInt(row.totalHouseholds),
        row.personsPerHousehold,
      ])
    );

    renderTable(
      document.getElementById("censusHouseholdTable"),
      ["OA Code", "Households", "Population", "PPH"],
      data.census.topHouseholds.map((row) => [
        row.oaCode,
        formatInt(row.totalHouseholds),
        formatInt(row.totalPopulation),
        row.personsPerHousehold,
      ])
    );
  }

  function renderTable(tableEl, headers, rows) {
    tableEl.innerHTML = `
      <thead>
        <tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows
          .map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
          .join("")}
      </tbody>
    `;
  }

  function updateUiText() {
    const subtitles = {
      parcel_use: "Parcel main-use layer",
      parcel_zoning: "Parcel zoning layer",
      oa_population: "OA population layer",
      oa_household: "OA household layer",
    };

    document.getElementById("mapSubtitle").textContent = subtitles[state.layerMode];
    document.getElementById("parcelPieTitle").textContent =
      state.layerMode === "parcel_zoning" ? "Parcel Share by Zoning" : "Parcel Share by Main Use";
    document.getElementById("floorPieTitle").textContent =
      state.layerMode === "parcel_zoning" ? "Floor Area Share by Zoning" : "Floor Area Share by Main Use";
  }

  function redraw() {
    drawMap();
    fillLegend();
    fillParcelDetail();
    fillOaDetail();
    fillFilterSummary();
    drawPies();
  }

  function drawMap() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f8f3ea";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (state.layerMode === "oa_population" || state.layerMode === "oa_household") {
      data.oaBoundaries.forEach((feature) => drawOa(feature));
      if (state.selectedOa) drawOutline(state.selectedOa, "#111827", 2.2);
    } else {
      getFilteredParcels().forEach((feature) => drawParcel(feature));
      if (state.selectedParcel) drawOutline(state.selectedParcel, "#111827", 2.2);
    }

    ctx.fillStyle = "rgba(30, 41, 59, 0.84)";
    ctx.font = "12px Bahnschrift";
    ctx.fillText("Wheel: zoom  Drag: pan  Click: detail", 18, 24);
  }

  function drawParcel(feature) {
    const palette = state.layerMode === "parcel_zoning" ? data.palette.zoning : data.palette.use;
    const key = state.layerMode === "parcel_zoning" ? feature.primaryZoning : feature.dominantUse;
    ctx.beginPath();
    traceRings(feature.rings);
    ctx.fillStyle = hexToRgba(palette[key] || "#c0c0c0", 0.8);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.45;
    ctx.fill("evenodd");
    ctx.stroke();
  }

  function drawOa(feature) {
    const isPopulation = state.layerMode === "oa_population";
    const value = isPopulation ? feature.totalPopulation : feature.totalHouseholds;
    const maxValue = isPopulation ? data.census.populationMax : data.census.householdMax;
    ctx.beginPath();
    traceRings(feature.rings);
    ctx.fillStyle = interpolateColor("#f4ede2", "#ee6c4d", maxValue ? value / maxValue : 0);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 0.5;
    ctx.fill("evenodd");
    ctx.stroke();
  }

  function drawOutline(feature, color, width) {
    ctx.save();
    ctx.beginPath();
    traceRings(feature.rings);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  }

  function traceRings(rings) {
    rings.forEach((ring) => {
      for (let index = 0; index < ring.length; index += 2) {
        const point = worldToScreen(ring[index], ring[index + 1], state.view);
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.closePath();
    });
  }

  function fillLegend() {
    const legendEl = document.getElementById("legend");

    if (state.layerMode === "oa_population" || state.layerMode === "oa_household") {
      const maxValue = state.layerMode === "oa_population" ? data.census.populationMax : data.census.householdMax;
      legendEl.innerHTML = `
        <h4>${state.layerMode === "oa_population" ? "OA Population" : "OA Households"}</h4>
        <div class="gradient-bar" style="background:linear-gradient(90deg, #f4ede2 0%, #ee6c4d 100%);"></div>
        <div class="legend-scale"><span>0</span><span>${formatInt(maxValue)}</span></div>
      `;
      return;
    }

    const rows = state.layerMode === "parcel_zoning" ? data.parcelStats.zoningRows : data.parcelStats.useRows;
    const palette = state.layerMode === "parcel_zoning" ? data.palette.zoning : data.palette.use;
    legendEl.innerHTML = `
      <h4>${state.layerMode === "parcel_zoning" ? "Zoning" : "Main Use"} Legend</h4>
      <div class="legend-grid">
        ${rows
          .slice(0, 12)
          .map(
            (row) => `
              <div class="legend-item">
                <span class="legend-swatch" style="background:${palette[row.label] || "#b7b7b7"}"></span>
                <span>${row.label}</span>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function fillParcelDetail() {
    const target = document.getElementById("selectedParcel");
    const feature = state.selectedParcel;

    if (!feature) {
      target.innerHTML = `<p class="muted">Click a parcel on a parcel layer.</p>`;
      return;
    }

    target.innerHTML = `
      <dl class="detail-grid">
        <dt>PNU</dt><dd>${feature.pnu}</dd>
        <dt>Address</dt><dd>${feature.address || "-"}</dd>
        <dt>Dong</dt><dd>${feature.dongName || "-"}</dd>
        <dt>Land</dt><dd>${feature.landCategory || "-"}</dd>
        <dt>Main Use</dt><dd>${feature.dominantUse || "-"}</dd>
        <dt>Zoning</dt><dd>${feature.primaryZoning || "-"}</dd>
        <dt>Zoning Code</dt><dd>${feature.zoningCode || "-"}</dd>
        <dt>Floor Area</dt><dd>${formatInt(feature.totalFloorArea)} sq.m</dd>
        <dt>Ledger Bldgs</dt><dd>${formatInt(feature.ledgerBuildingCount)}</dd>
        <dt>GIS Bldgs</dt><dd>${formatInt(feature.gisBuildingCount)}</dd>
        <dt>Units</dt><dd>${formatInt(feature.totalUnits)}</dd>
        <dt>Households</dt><dd>${formatInt(feature.totalHouseholds)}</dd>
      </dl>
    `;
  }

  function fillOaDetail() {
    const target = document.getElementById("selectedOa");
    const feature = state.selectedOa;

    if (!feature) {
      target.innerHTML = `<p class="muted">Click an OA on an OA layer.</p>`;
      return;
    }

    target.innerHTML = `
      <dl class="detail-grid">
        <dt>OA Code</dt><dd>${feature.oaCode}</dd>
        <dt>ADM CD</dt><dd>${feature.admCd}</dd>
        <dt>Population</dt><dd>${formatInt(feature.totalPopulation)}</dd>
        <dt>Households</dt><dd>${formatInt(feature.totalHouseholds)}</dd>
        <dt>PPH</dt><dd>${feature.personsPerHousehold}</dd>
      </dl>
    `;
  }

  function fillFilterSummary() {
    const filtered = getFilteredParcels();
    document.getElementById("filterSummary").innerHTML = `
      <dl class="detail-grid">
        <dt>Visible Parcels</dt><dd>${formatInt(filtered.length)}</dd>
        <dt>Dong Filter</dt><dd>${state.selectedDong}</dd>
        <dt>Use Filter</dt><dd>${state.selectedUse}</dd>
        <dt>Search</dt><dd>${state.searchTerm || "-"}</dd>
      </dl>
    `;
  }

  function drawPies() {
    const rows = state.layerMode === "parcel_zoning" ? data.parcelStats.zoningRows : data.parcelStats.useRows;
    const palette = state.layerMode === "parcel_zoning" ? data.palette.zoning : data.palette.use;

    drawPie(
      document.getElementById("parcelPie"),
      rows.map((row) => ({
        label: row.label,
        value: row.parcelCount,
        color: palette[row.label] || "#b7b7b7",
      }))
    );

    drawPie(
      document.getElementById("floorPie"),
      rows.map((row) => ({
        label: row.label,
        value: row.floorArea,
        color: palette[row.label] || "#b7b7b7",
      }))
    );
  }

  function drawPie(canvasEl, rows) {
    const chart = canvasEl.getContext("2d");
    chart.clearRect(0, 0, canvasEl.width, canvasEl.height);

    const topRows = rows.slice(0, 7);
    const otherValue = rows.slice(7).reduce((sum, row) => sum + row.value, 0);
    if (otherValue > 0) topRows.push({ label: "Other", value: otherValue, color: "#d4d4d4" });

    const total = topRows.reduce((sum, row) => sum + row.value, 0);
    const centerX = 104;
    const centerY = 118;
    const radius = 80;
    let start = -Math.PI / 2;

    topRows.forEach((row) => {
      const angle = total ? (row.value / total) * Math.PI * 2 : 0;
      chart.beginPath();
      chart.moveTo(centerX, centerY);
      chart.arc(centerX, centerY, radius, start, start + angle);
      chart.closePath();
      chart.fillStyle = row.color;
      chart.fill();
      start += angle;
    });

    chart.beginPath();
    chart.arc(centerX, centerY, 42, 0, Math.PI * 2);
    chart.fillStyle = "#fffaf2";
    chart.fill();
  }

  function getFilteredParcels() {
    const term = state.searchTerm.toLowerCase();
    return data.parcels.filter((feature) => {
      const dongPass = state.selectedDong === "ALL" || feature.dongName === state.selectedDong;
      const usePass = state.selectedUse === "ALL" || feature.dominantUse === state.selectedUse;
      const searchPass =
        !term ||
        feature.pnu.toLowerCase().includes(term) ||
        String(feature.address || "").toLowerCase().includes(term);
      return dongPass && usePass && searchPass;
    });
  }

  function populateSelect(selectEl, values) {
    selectEl.innerHTML = values.map((value) => `<option value="${value}">${value}</option>`).join("");
  }

  function pickFeature(worldX, worldY, features) {
    for (let index = features.length - 1; index >= 0; index -= 1) {
      const feature = features[index];
      if (!bboxContains(feature.bbox, worldX, worldY)) continue;
      if (polygonContains(feature.rings, worldX, worldY)) return feature;
    }
    return null;
  }

  function bboxContains(bbox, x, y) {
    return x >= bbox[0] && x <= bbox[2] && y >= bbox[1] && y <= bbox[3];
  }

  function polygonContains(rings, x, y) {
    let inside = false;
    rings.forEach((ring) => {
      if (pointInRing(ring, x, y)) inside = !inside;
    });
    return inside;
  }

  function pointInRing(ring, x, y) {
    let inside = false;
    for (let i = 0, j = ring.length - 2; i < ring.length; i += 2) {
      const xi = ring[i];
      const yi = ring[i + 1];
      const xj = ring[j];
      const yj = ring[j + 1];
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi;
      if (intersect) inside = !inside;
      j = i;
    }
    return inside;
  }

  function computeWorldBounds(features) {
    return features.reduce(
      (acc, feature) => ({
        minX: Math.min(acc.minX, feature.bbox[0]),
        minY: Math.min(acc.minY, feature.bbox[1]),
        maxX: Math.max(acc.maxX, feature.bbox[2]),
        maxY: Math.max(acc.maxY, feature.bbox[3]),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );
  }

  function fitView(bounds, width, height) {
    const padding = 36;
    const scale = Math.min(
      (width - padding * 2) / (bounds.maxX - bounds.minX),
      (height - padding * 2) / (bounds.maxY - bounds.minY)
    );
    return {
      scale,
      offsetX: padding - bounds.minX * scale,
      offsetY: height - padding + bounds.minY * scale,
    };
  }

  function worldToScreen(x, y, view) {
    return {
      x: x * view.scale + view.offsetX,
      y: view.offsetY - y * view.scale,
    };
  }

  function screenToWorld(x, y, view) {
    return {
      x: (x - view.offsetX) / view.scale,
      y: (view.offsetY - y) / view.scale,
    };
  }

  function uniqueSorted(values) {
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, "ko"));
  }

  function hexToRgba(hex, alpha) {
    const value = Number.parseInt(hex.replace("#", ""), 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }

  function interpolateColor(startHex, endHex, ratio) {
    const start = parseHex(startHex);
    const end = parseHex(endHex);
    const clamped = Math.max(0, Math.min(1, ratio));
    const r = Math.round(start.r + (end.r - start.r) * clamped);
    const g = Math.round(start.g + (end.g - start.g) * clamped);
    const b = Math.round(start.b + (end.b - start.b) * clamped);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function parseHex(hex) {
    const value = Number.parseInt(hex.replace("#", ""), 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
    };
  }

  function formatInt(value) {
    return Math.round(Number(value) || 0).toLocaleString("ko-KR");
  }

  function formatPercent(ratio) {
    return `${Math.round((ratio || 0) * 1000) / 10}%`;
  }
})();
