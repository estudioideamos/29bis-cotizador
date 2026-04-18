(function () {
  const config = window.APP_CONFIG || {};
  const fallbackData = window.PRICING_DATA;

  const els = {
    form: document.getElementById("quote-form"),
    machine: document.getElementById("machine"),
    paper: document.getElementById("paper"),
    size: document.getElementById("size"),
    customSizePanel: document.getElementById("custom-size-panel"),
    customWidth: document.getElementById("custom-width"),
    customHeight: document.getElementById("custom-height"),
    customAreaPreview: document.getElementById("custom-area-preview"),
    customWhatsappLink: document.getElementById("custom-whatsapp-link"),
    sidesField: document.getElementById("sides-field"),
    sides: document.getElementById("sides"),
    quantity: document.getElementById("quantity"),
    quantityGrid: document.getElementById("quantity-grid"),
    coverageWrap: document.getElementById("coverage-wrap"),
    coverageGrid: document.getElementById("coverage-grid"),
    addItemBtn: document.getElementById("add-item-btn"),
    toggleItemsBtn: document.getElementById("toggle-items-btn"),
    itemsPanel: document.getElementById("items-panel"),
    itemsList: document.getElementById("items-list"),
    paymentMethodRadios: document.querySelectorAll("input[name='payment-method']"),
    paymentTransferInfo: document.getElementById("payment-transfer-info"),
    paymentLocalInfo: document.getElementById("payment-local-info"),
    summary: document.getElementById("summary"),
    recalcBtn: document.getElementById("recalc-btn"),
    status: document.getElementById("status"),
    customerName: document.getElementById("customer-name"),
    customerPhone: document.getElementById("customer-phone"),
    customerEmail: document.getElementById("customer-email"),
    pickupDatetime: document.getElementById("pickup-datetime"),
    notes: document.getElementById("notes"),
    fileInput: document.getElementById("file-input"),
    uploadPanel: document.querySelector(".upload-panel"),
    fileMeta: document.getElementById("file-meta")
  };

  let pricing = null;

  const currency = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  });

  const state = {
    coverageInputs: {},
    currentTotals: null,
    savedItems: [],
    showItemsPanel: false
  };

  const COVERAGE_MEDIA = {
    lineas: {
      image: "https://ideamos.ar/imprenta/wp-content/uploads/2026/04/linea2.jpg",
      alt: "Cobertura Líneas"
    },
    mixto: {
      image: "https://ideamos.ar/imprenta/wp-content/uploads/2026/04/medio.jpg",
      alt: "Cobertura medio"
    },
    pleno: {
      image: "https://ideamos.ar/imprenta/wp-content/uploads/2026/04/pleno.jpg",
      alt: "Cobertura pleno"
    }
  };

  function setStatus(message, kind) {
    els.status.textContent = message || "";
    els.status.className = "status";
    if (kind) {
      els.status.classList.add(kind);
    }
  }

  function formatBytes(size) {
    const units = ["B", "KB", "MB", "GB"];
    let value = Number(size) || 0;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    const decimals = unitIndex === 0 ? 0 : 1;
    return `${value.toFixed(decimals)} ${units[unitIndex]}`;
  }

  function updateFileMeta() {
    if (!els.fileMeta) {
      return;
    }
    const files = Array.from(els.fileInput.files || []);
    if (!files.length) {
      els.fileMeta.textContent = "Aún no seleccionaste archivos.";
      return;
    }
    const totalBytes = files.reduce((acc, file) => acc + (file.size || 0), 0);
    const names = files.slice(0, 2).map((file) => file.name).join(" · ");
    const suffix = files.length > 2 ? ` +${files.length - 2} más` : "";
    els.fileMeta.textContent = `${files.length} archivo(s) · ${formatBytes(totalBytes)} · ${names}${suffix}`;
  }

  function createOption(value, label) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    return opt;
  }

  function clearSelect(selectEl) {
    while (selectEl.firstChild) {
      selectEl.removeChild(selectEl.firstChild);
    }
  }

  async function loadPricingData() {
    if (config.pricesMode === "remote-json" && config.pricesJsonUrl) {
      try {
        const response = await fetch(config.pricesJsonUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("No se pudo leer el JSON remoto de precios.");
        }
        return await response.json();
      } catch (err) {
        setStatus(`${err.message} Se usará la tabla local.`, "error");
      }
    }
    return fallbackData;
  }

  function isLaser(machineKey) {
    return machineKey === "laser";
  }

  function isPlotter(machineKey) {
    return machineKey === "plotter";
  }

  function getPaperType(paperKey) {
    return pricing.papers[paperKey]?.type || "";
  }

  function isPaperAvailable(paperKey) {
    if (!paperKey) {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(config.paperAvailabilityOverrides || {}, paperKey)) {
      return Boolean(config.paperAvailabilityOverrides[paperKey]);
    }
    return true;
  }

  function usesCoverage(machineKey, paperKey) {
    return isPlotter(machineKey) || (isLaser(machineKey) && paperKey === "obra_80");
  }

  function isCustomPlotterSize() {
    return els.machine.value === "plotter" && els.size.value === "100x100_personalizado";
  }

  function parseDimension(inputValue) {
    const normalized = String(inputValue || "").replace(",", ".").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getCustomDimensions() {
    const widthM = parseDimension(els.customWidth.value);
    const heightM = parseDimension(els.customHeight.value);
    const areaM2 = widthM * heightM;
    return { widthM, heightM, areaM2 };
  }

  function updateCustomAreaPreview() {
    const { widthM, heightM, areaM2 } = getCustomDimensions();
    const show = isCustomPlotterSize();
    els.customSizePanel.classList.toggle("hidden", !show);
    if (!show) {
      return;
    }
    els.customAreaPreview.textContent = `Área: ${areaM2.toFixed(2)} m² (${widthM.toFixed(2)} m × ${heightM.toFixed(2)} m)`;
  }

  function updateCustomWhatsappLink() {
    const phone = String(config.whatsappNumber || "").replace(/\D/g, "");
    const hasNumber = Boolean(phone);
    const show = isCustomPlotterSize() && hasNumber;
    els.customWhatsappLink.classList.toggle("hidden", !show);
    if (!show) {
      return;
    }

    const { widthM, heightM, areaM2 } = getCustomDimensions();
    const machineLabel = pricing.machines[els.machine.value]?.label || "Plotter";
    const paperLabel = getPaperLabel(els.paper.value);
    const msg = [
      config.whatsappMessage || "Hola! Quiero cotizar un pedido en tamaño personalizado.",
      `Máquina: ${machineLabel}`,
      `Papel: ${paperLabel}`,
      `Medidas: ${widthM.toFixed(2)} m x ${heightM.toFixed(2)} m`,
      `Superficie: ${areaM2.toFixed(2)} m²`
    ].join("\n");

    els.customWhatsappLink.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }

  function getAllowedSizes(machineKey, paperKey) {
    if (isPlotter(machineKey)) {
      return pricing.plotter.sizes;
    }

    if (paperKey === "obra_80") {
      return pricing.laser.common.sizes;
    }

    const onlySA3 = pricing.laser.special.sizesByPaper.onlySA3.includes(paperKey);
    return onlySA3
      ? ["SA3"]
      : pricing.laser.special.sizesByPaper.default;
  }

  function getPaperLabel(paperKey) {
    return pricing.papers[paperKey]?.label || paperKey;
  }

  function getSizeLabel(sizeKey) {
    return pricing.labels.sizes[sizeKey] || sizeKey;
  }

  function getCoverageLabel(key) {
    return pricing.labels.coverage[key] || key;
  }

  function buildMachineOptions() {
    clearSelect(els.machine);
    Object.entries(pricing.machines).forEach(([machineKey, machine]) => {
      els.machine.appendChild(createOption(machineKey, machine.label));
    });
  }

  function buildPaperOptions() {
    clearSelect(els.paper);
    const machineKey = els.machine.value;
    const machine = pricing.machines[machineKey];
    machine.papers.forEach((paperKey) => {
      const opt = createOption(paperKey, getPaperLabel(paperKey));
      if (!isPaperAvailable(paperKey)) {
        opt.disabled = true;
        opt.textContent = `${getPaperLabel(paperKey)} (sin stock)`;
      }
      els.paper.appendChild(opt);
    });

    const firstAvailable = Array.from(els.paper.options).find((opt) => !opt.disabled);
    if (firstAvailable) {
      els.paper.value = firstAvailable.value;
    }
  }

  function buildSizeOptions() {
    clearSelect(els.size);
    const sizes = getAllowedSizes(els.machine.value, els.paper.value);
    sizes.forEach((sizeKey) => {
      els.size.appendChild(createOption(sizeKey, getSizeLabel(sizeKey)));
    });
  }

  function buildSidesOptions() {
    clearSelect(els.sides);
    const machineKey = els.machine.value;
    const paperKey = els.paper.value;
    const sizeKey = els.size.value;

    els.sides.appendChild(createOption("sf", pricing.labels.sides.sf));

    if (!isLaser(machineKey)) {
      return;
    }

    const simpleOnlyPapers = ["autoadhesivo_obra", "autoadhesivo_brillo", "opp"];
    if (simpleOnlyPapers.includes(paperKey)) {
      return;
    }

    if (isSideAvailable(paperKey, sizeKey, "df")) {
      els.sides.appendChild(createOption("df", pricing.labels.sides.df));
    }
  }

  function buildCoverageInputs() {
    while (els.coverageGrid.firstChild) {
      els.coverageGrid.removeChild(els.coverageGrid.firstChild);
    }
    state.coverageInputs = {};

    const rows = ["lineas", "mixto", "pleno"];
    rows.forEach((coverageKey) => {
      const card = document.createElement("div");
      card.className = `coverage-card coverage-${coverageKey}`;

      const label = document.createElement("label");
      label.className = "field";
      label.innerHTML = `<span>${getCoverageLabel(coverageKey)}</span>`;

      const media = document.createElement("div");
      media.className = "coverage-media";
      media.innerHTML = `
        <img src="${COVERAGE_MEDIA[coverageKey].image}" alt="${COVERAGE_MEDIA[coverageKey].alt}" loading="lazy">
      `;

      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "1";
      input.value = "0";
      input.dataset.coverageKey = coverageKey;
      input.placeholder = "0";
      input.addEventListener("input", updateSummary);

      const helper = document.createElement("small");
      helper.className = "coverage-helper";
      helper.textContent = "Hojas";

      label.appendChild(input);
      label.appendChild(helper);
      card.appendChild(media);
      card.appendChild(label);
      els.coverageGrid.appendChild(card);
      state.coverageInputs[coverageKey] = input;
    });
  }

  function toggleConditionalFields() {
    const machineKey = els.machine.value;
    const paperKey = els.paper.value;
    const showCoverage = usesCoverage(machineKey, paperKey);

    els.coverageWrap.classList.toggle("hidden", !showCoverage);
    els.quantityGrid.classList.toggle("hidden", showCoverage);

    const showSides = isLaser(machineKey);
    els.sidesField.classList.toggle("hidden", !showSides);

    if (showSides && !isSideAvailable(els.paper.value, els.size.value, els.sides.value)) {
      els.sides.value = "sf";
    }

    updateCustomAreaPreview();
    updateCustomWhatsappLink();
  }

  function isSideAvailable(paperKey, sizeKey, sideKey) {
    if (sideKey === "sf") {
      return true;
    }
    if (paperKey === "obra_80") {
      return true;
    }
    const entry = pricing.laser.special.prices[sizeKey]?.[paperKey];
    return Boolean(entry && entry.df);
  }

  function getUnitPrice(params) {
    const { machineKey, paperKey, sizeKey, sideKey, coverageKey } = params;

    if (isPlotter(machineKey)) {
      return pricing.plotter.prices[sizeKey]?.[paperKey]?.[coverageKey] || null;
    }

    if (paperKey === "obra_80") {
      return pricing.laser.common.prices[sizeKey]?.[coverageKey]?.[sideKey] || null;
    }

    return pricing.laser.special.prices[sizeKey]?.[paperKey]?.[sideKey] || null;
  }

  function getQuantityTotal() {
    const machineKey = els.machine.value;
    const paperKey = els.paper.value;
    if (!usesCoverage(machineKey, paperKey)) {
      return Number(els.quantity.value) || 0;
    }
    return Object.values(state.coverageInputs)
      .reduce((acc, input) => acc + (Number(input.value) || 0), 0);
  }

  function getLaserDiscountRate(sheetCount) {
    const match = pricing.laser.discounts.find((tier) => sheetCount >= tier.minSheets);
    return match ? match.rate : 0;
  }

  function getCurrentQuote() {
    const machineKey = els.machine.value;
    const paperKey = els.paper.value;
    const sizeKey = els.size.value;
    const sideKey = els.sides.value;
    const withCoverage = usesCoverage(machineKey, paperKey);

    let subtotal = 0;
    let detailLines = [];
    const customSize = isCustomPlotterSize() ? getCustomDimensions() : null;
    const areaMultiplier = customSize ? customSize.areaM2 : 1;

    if (withCoverage) {
      Object.entries(state.coverageInputs).forEach(([coverageKey, input]) => {
        const qty = Number(input.value) || 0;
        if (qty <= 0) {
          return;
        }
        const unit = getUnitPrice({ machineKey, paperKey, sizeKey, sideKey, coverageKey });
        if (!unit) {
          return;
        }
        const lineTotal = unit * areaMultiplier * qty;
        subtotal += lineTotal;
        detailLines.push({
          name: `${getCoverageLabel(coverageKey)} (${qty} hojas${customSize ? ` · ${customSize.areaM2.toFixed(2)} m²` : ""})`,
          amount: lineTotal
        });
      });
    } else {
      const qty = Number(els.quantity.value) || 0;
      const unit = getUnitPrice({ machineKey, paperKey, sizeKey, sideKey });
      if (qty > 0 && unit) {
        const lineTotal = unit * areaMultiplier * qty;
        subtotal += lineTotal;
        detailLines.push({
          name: `${qty} hojas x ${currency.format(unit)}${customSize ? ` x ${customSize.areaM2.toFixed(2)} m²` : ""}`,
          amount: lineTotal
        });
      }
    }

    const totalSheets = getQuantityTotal();
    const discountRate = 0;
    const discountAmount = 0;
    const total = subtotal;

    return {
      machineKey,
      paperKey,
      sizeKey,
      sideKey,
      customSize,
      subtotal,
      discountRate,
      discountAmount,
      total,
      totalSheets,
      detailLines
    };
  }

  function getCurrentWorkSnapshot() {
    const totals = getCurrentQuote();
    if (!totals.totalSheets || totals.total <= 0) {
      return null;
    }

    const machineKey = totals.machineKey;
    const paperKey = totals.paperKey;
    const sizeKey = totals.sizeKey;
    const sideKey = isLaser(machineKey) ? totals.sideKey : null;

    return {
      id: `work-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      machine: {
        key: machineKey,
        label: pricing.machines[machineKey].label
      },
      paper: {
        key: paperKey,
        label: getPaperLabel(paperKey),
        type: getPaperType(paperKey)
      },
      size: {
        key: sizeKey,
        label: getSizeLabel(sizeKey)
      },
      customSize: totals.customSize,
      sides: sideKey ? { key: sideKey, label: pricing.labels.sides[sideKey] } : null,
      quantity: usesCoverage(machineKey, paperKey) ? null : Number(els.quantity.value) || 0,
      coverageDistribution: usesCoverage(machineKey, paperKey) ? getCoverageDistribution() : [],
      pricing: {
        subtotal: totals.subtotal,
        discountRate: totals.discountRate,
        discountAmount: totals.discountAmount,
        total: totals.total,
        totalSheets: totals.totalSheets
      }
    };
  }

  function getAggregatedPricing(orderItems) {
    const subtotal = orderItems.reduce((acc, item) => acc + (item.pricing.subtotal || 0), 0);
    const totalSheets = orderItems.reduce((acc, item) => acc + (item.pricing.totalSheets || 0), 0);

    const laserItems = orderItems.filter((item) => item.machine?.key === "laser");
    const laserSheets = laserItems.reduce((acc, item) => acc + (item.pricing.totalSheets || 0), 0);
    const laserSubtotal = laserItems.reduce((acc, item) => acc + (item.pricing.subtotal || 0), 0);

    const discountRate = getLaserDiscountRate(laserSheets);
    const discountAmount = laserSubtotal * discountRate;
    const total = subtotal - discountAmount;

    return {
      subtotal,
      totalSheets,
      laserSheets,
      laserSubtotal,
      discountRate,
      discountAmount,
      total
    };
  }

  function clearWorkInputsForNextItem() {
    if (usesCoverage(els.machine.value, els.paper.value)) {
      Object.values(state.coverageInputs).forEach((input) => { input.value = "0"; });
    } else {
      els.quantity.value = "";
    }
    updateSummary();
  }

  function renderItemsPanel() {
    const count = state.savedItems.length;
    els.toggleItemsBtn.classList.toggle("hidden", count === 0);
    els.toggleItemsBtn.textContent = `Ver trabajos agregados (${count})`;
    els.toggleItemsBtn.setAttribute("aria-expanded", state.showItemsPanel ? "true" : "false");
    els.itemsPanel.classList.toggle("hidden", !state.showItemsPanel || count === 0);

    if (count === 0) {
      els.itemsList.innerHTML = "";
      return;
    }

    const frag = document.createDocumentFragment();
    state.savedItems.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "item-row";
      const customSizeText = item.customSize
        ? ` · ${item.customSize.widthM.toFixed(2)}m x ${item.customSize.heightM.toFixed(2)}m`
        : "";
      row.innerHTML = `
        <div>
          <strong>Trabajo ${index + 1}</strong>
          <p>${item.machine.label} · ${item.paper.label} · ${item.size.label}${customSizeText}${item.sides ? ` · ${item.sides.label}` : ""}</p>
          <small>${item.pricing.totalSheets} hojas · ${currency.format(item.pricing.total)}</small>
        </div>
        <button type="button" class="item-remove" data-item-id="${item.id}">Quitar</button>
      `;
      frag.appendChild(row);
    });
    els.itemsList.innerHTML = "";
    els.itemsList.appendChild(frag);
  }

  function updateSummary() {
    state.currentTotals = getCurrentQuote();

    updateCustomAreaPreview();
    updateCustomWhatsappLink();
    renderItemsPanel();
    renderSummary();
  }

  function renderSummary() {
    const totals = state.currentTotals || {
      subtotal: 0,
      discountRate: 0,
      discountAmount: 0,
      total: 0,
      totalSheets: 0,
      detailLines: []
    };

    const sideText = isLaser(els.machine.value) ? pricing.labels.sides[els.sides.value] : "N/A";
    const orderItemsForSummary = [...state.savedItems];
    const currentWork = getCurrentWorkSnapshot();
    if (currentWork) {
      orderItemsForSummary.push(currentWork);
    }
    const aggregated = getAggregatedPricing(orderItemsForSummary);

    const frag = document.createDocumentFragment();
    const rows = [
      ["Máquina", pricing.machines[els.machine.value]?.label || "-"],
      ["Papel", getPaperLabel(els.paper.value)],
      ["Tamaño", getSizeLabel(els.size.value)],
      ["Faz", sideText],
      ["Hojas totales (pedido)", String(aggregated.totalSheets)]
    ];
    if (isCustomPlotterSize()) {
      const custom = getCustomDimensions();
      rows.splice(3, 0, ["Medida personalizada", `${custom.widthM.toFixed(2)} m × ${custom.heightM.toFixed(2)} m`]);
    }

    rows.forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
      frag.appendChild(row);
    });

    totals.detailLines.forEach((item) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<span>${item.name}</span><strong>${currency.format(item.amount)}</strong>`;
      frag.appendChild(row);
    });

    const subtotalRow = document.createElement("div");
    subtotalRow.className = "row";
    subtotalRow.innerHTML = `<span>Subtotal</span><strong>${currency.format(aggregated.subtotal)}</strong>`;
    frag.appendChild(subtotalRow);

    if (aggregated.discountRate > 0) {
      const discountRow = document.createElement("div");
      discountRow.className = "row discount";
      discountRow.innerHTML = `<span>Descuento láser por cantidad (${Math.round(aggregated.discountRate * 100)}%)</span><strong>- ${currency.format(aggregated.discountAmount)}</strong>`;
      frag.appendChild(discountRow);
    }

    const totalRow = document.createElement("div");
    totalRow.className = "row total";
    totalRow.innerHTML = `<span>Total estimado</span><strong>${currency.format(aggregated.total)}</strong>`;
    frag.appendChild(totalRow);

    if (state.savedItems.length > 0) {
      const infoRow = document.createElement("div");
      infoRow.className = "row";
      infoRow.innerHTML = `<span>Trabajos agregados</span><strong>${state.savedItems.length}</strong>`;
      frag.appendChild(infoRow);
    }

    if (aggregated.discountRate > 0) {
      const badgeRow = document.createElement("div");
      badgeRow.className = "discount-badge-row";
      badgeRow.innerHTML = `
        <span class="discount-badge">
          ✅ Descuento aplicado por ${aggregated.laserSheets} hojas láser acumuladas en este pedido
        </span>
      `;
      frag.appendChild(badgeRow);

      const ruleRow = document.createElement("div");
      ruleRow.className = "row";
      ruleRow.innerHTML = `<span>Base descuento láser</span><strong>${aggregated.laserSheets} hojas</strong>`;
      frag.appendChild(ruleRow);
    }

    els.summary.innerHTML = "";
    els.summary.appendChild(frag);
  }

  function getCoverageDistribution() {
    return Object.entries(state.coverageInputs).map(([coverageKey, input]) => ({
      coverage: coverageKey,
      label: getCoverageLabel(coverageKey),
      sheets: Number(input.value) || 0
    })).filter((entry) => entry.sheets > 0);
  }

  function getSelectedPaymentMethod() {
    const selected = Array.from(els.paymentMethodRadios).find((radio) => radio.checked);
    if (!selected) {
      return null;
    }
    if (selected.value === "transferencia") {
      return { key: "transferencia", label: "Transferencia bancaria" };
    }
    return { key: "local", label: "Pagar en el local" };
  }

  function fileToPayload(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve({
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size || 0,
          base64
        });
      };
      reader.onerror = () => {
        reject(new Error(`No se pudo leer el archivo: ${file.name}`));
      };
      reader.readAsDataURL(file);
    });
  }

  async function buildFilesPayload(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) {
      return [];
    }
    return Promise.all(files.map(fileToPayload));
  }

  function updatePaymentUI() {
    const method = getSelectedPaymentMethod();
    const isTransfer = method?.key === "transferencia";
    const isLocal = method?.key === "local";
    els.paymentTransferInfo.classList.toggle("hidden", !isTransfer);
    els.paymentLocalInfo.classList.toggle("hidden", !isLocal);
  }

  function validateForm() {
    if (!els.form.checkValidity()) {
      els.form.reportValidity();
      return false;
    }

    const machine = els.machine.value;
    if (machine === "laser" && !isSideAvailable(els.paper.value, els.size.value, els.sides.value)) {
      setStatus("Ese papel no permite doble faz en este tamaño.", "error");
      return false;
    }

    if (isCustomPlotterSize()) {
      const { widthM, heightM, areaM2 } = getCustomDimensions();
      if (widthM <= 0 || heightM <= 0 || areaM2 <= 0) {
        setStatus("Ingresá ancho y alto válidos en metros para el tamaño personalizado.", "error");
        return false;
      }
    }

    const currentWork = getCurrentWorkSnapshot();
    if (!currentWork && state.savedItems.length === 0) {
      setStatus("Agregá al menos un trabajo con cantidad de hojas mayor a 0.", "error");
      return false;
    }

    return true;
  }

  async function buildOrderPayload(orderItems) {
    const urgent = !els.pickupDatetime.value;
    const pricingTotals = getAggregatedPricing(orderItems);
    const paymentMethod = getSelectedPaymentMethod();
    const uploadedFiles = await buildFilesPayload(els.fileInput.files);
    const firstFileName = uploadedFiles[0] ? uploadedFiles[0].name : null;

    return {
      orderId: `29BIS-${Date.now()}`,
      createdAt: new Date().toISOString(),
      orderItems,
      customer: {
        name: els.customerName.value.trim(),
        phone: els.customerPhone.value.trim(),
        email: els.customerEmail.value.trim()
      },
      pickupDateTime: els.pickupDatetime.value || null,
      urgent,
      payment: paymentMethod,
      notes: els.notes.value.trim(),
      fileName: firstFileName,
      fileNames: uploadedFiles.map((file) => file.name),
      uploadedFiles,
      pricing: {
        subtotal: pricingTotals.subtotal,
        discountRate: pricingTotals.discountRate,
        discountAmount: pricingTotals.discountAmount,
        total: pricingTotals.total,
        totalSheets: pricingTotals.totalSheets
      }
    };
  }
  async function submitOrder(payload) {
    if (!config.ordersWebhookUrl) {
      return { ok: true, mode: "local-preview" };
    }

    const response = await fetch(config.ordersWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error("No se pudo guardar el pedido en Google Sheets.");
    }
    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.message || "No se pudo guardar el pedido.");
    }
    return {
      ok: true,
      mode: "sheets",
      orderNumber: data.orderNumber || payload.orderId
    };
  }

  function saveLocalPreview(payload) {
    const raw = localStorage.getItem("orders-29bis");
    const list = raw ? JSON.parse(raw) : [];
    list.unshift(payload);
    localStorage.setItem("orders-29bis", JSON.stringify(list.slice(0, 30)));
  }

  function syncUI() {
    buildPaperOptions();
    buildSizeOptions();
    buildSidesOptions();
    toggleConditionalFields();
    updateSummary();
  }

  function bindEvents() {
    els.machine.addEventListener("change", () => {
      buildPaperOptions();
      buildSizeOptions();
      buildSidesOptions();
      toggleConditionalFields();
      updateSummary();
    });

    els.paper.addEventListener("change", () => {
      buildSizeOptions();
      buildSidesOptions();
      toggleConditionalFields();
      updateSummary();
    });

    els.size.addEventListener("change", () => {
      buildSidesOptions();
      toggleConditionalFields();
      updateSummary();
    });

    els.sides.addEventListener("change", updateSummary);
    els.quantity.addEventListener("input", updateSummary);
    els.customWidth.addEventListener("input", updateSummary);
    els.customHeight.addEventListener("input", updateSummary);
    els.recalcBtn.addEventListener("click", updateSummary);
    els.fileInput.addEventListener("change", updateFileMeta);
    els.paymentMethodRadios.forEach((radio) => {
      radio.addEventListener("change", updatePaymentUI);
    });

    const clearDragState = () => {
      if (els.uploadPanel) {
        els.uploadPanel.classList.remove("is-dragover");
      }
    };

    if (els.uploadPanel) {
      ["dragenter", "dragover"].forEach((evtName) => {
        els.uploadPanel.addEventListener(evtName, (event) => {
          event.preventDefault();
          els.uploadPanel.classList.add("is-dragover");
        });
      });
      ["dragleave", "drop"].forEach((evtName) => {
        els.uploadPanel.addEventListener(evtName, (event) => {
          event.preventDefault();
          clearDragState();
          if (evtName === "drop" && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
            try {
              els.fileInput.files = event.dataTransfer.files;
              updateFileMeta();
            } catch (err) {
              // Fallback silencioso: en algunos navegadores no se permite asignar FileList.
            }
          }
        });
      });
    }

    els.addItemBtn.addEventListener("click", () => {
      updateSummary();
      const currentWork = getCurrentWorkSnapshot();
      if (!currentWork) {
        setStatus("Primero cargá una cantidad válida para este trabajo antes de agregarlo.", "error");
        return;
      }

      state.savedItems.push(currentWork);
      state.showItemsPanel = true;
      renderItemsPanel();
      updateSummary();
      clearWorkInputsForNextItem();
      setStatus("Trabajo agregado al pedido. Podés cargar otro diferente.", "ok");
    });

    els.toggleItemsBtn.addEventListener("click", () => {
      state.showItemsPanel = !state.showItemsPanel;
      renderItemsPanel();
    });

    els.itemsList.addEventListener("click", (event) => {
      const button = event.target.closest(".item-remove");
      if (!button) {
        return;
      }
      const itemId = button.dataset.itemId;
      state.savedItems = state.savedItems.filter((item) => item.id !== itemId);
      if (state.savedItems.length === 0) {
        state.showItemsPanel = false;
      }
      renderItemsPanel();
      updateSummary();
    });

    els.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus("");

      updateSummary();
      if (!validateForm()) {
        return;
      }

      const orderItems = [...state.savedItems];
      const currentWork = getCurrentWorkSnapshot();
      if (currentWork) {
        orderItems.push(currentWork);
      }

      const payload = await buildOrderPayload(orderItems);
      const submitBtn = els.form.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      submitBtn.textContent = "Enviando...";

      try {
        const result = await submitOrder(payload);
        if (result.mode === "local-preview") {
          saveLocalPreview(payload);
          setStatus("Pedido generado. No hay webhook configurado: quedó guardado en vista local (localStorage).", "ok");
        } else {
          const orderNumberText = result.orderNumber ? ` N.º ${result.orderNumber}.` : "";
          setStatus(`Pedido enviado correctamente y guardado en Google Sheets.${orderNumberText}`, "ok");
        }
        els.form.reset();
        state.savedItems = [];
        state.showItemsPanel = false;
        renderItemsPanel();
        els.paymentMethodRadios.forEach((radio) => { radio.checked = false; });
        updatePaymentUI();
        Object.values(state.coverageInputs).forEach((input) => { input.value = "0"; });
        els.quantity.value = "";
        els.customWidth.value = "";
        els.customHeight.value = "";
        updateFileMeta();
        syncUI();
      } catch (err) {
        setStatus(err.message || "Error al enviar el pedido.", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Enviar pedido";
      }
    });
  }

  async function init() {
    pricing = await loadPricingData();
    buildMachineOptions();
    buildSidesOptions();
    buildCoverageInputs();
    bindEvents();
    updateFileMeta();
    updatePaymentUI();
    syncUI();
  }

  init();
})();



