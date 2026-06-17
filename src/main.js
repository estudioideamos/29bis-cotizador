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
    status: document.getElementById("status"),
    uploadProgress: document.getElementById("upload-progress"),
    uploadProgressLabel: document.getElementById("upload-progress-label"),
    uploadProgressPercent: document.getElementById("upload-progress-percent"),
    uploadProgressFill: document.getElementById("upload-progress-fill"),
    customerName: document.getElementById("customer-name"),
    customerPhone: document.getElementById("customer-phone"),
    customerDni: document.getElementById("customer-dni"),
    customerEmail: document.getElementById("customer-email"),
    pickupDatetime: document.getElementById("pickup-datetime"),
    notes: document.getElementById("notes"),
    fileInput: document.getElementById("file-input"),
    sendLinkLater: document.getElementById("send-link-later"),
    uploadPanel: document.querySelector(".upload-panel"),
    fileMeta: document.getElementById("file-meta"),
    progressSteps: Array.from(document.querySelectorAll(".premium-step"))
  };

  let pricing = null;
  let runtimePaperAvailability = { ...(config.paperAvailabilityOverrides || {}) };

  const currency = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  });

  const state = {
    coverageInputs: {},
    currentTotals: null,
    savedItems: [],
    showItemsPanel: false,
    isSubmitting: false
  };

  const pickupSchedule = config.pickupSchedule || {
    allowedWeekdays: [1, 2, 3, 4, 5],
    slots: ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
    daysAhead: 21
  };

  const COVERAGE_MEDIA = {
    lineas: {
      image: "./assets/cobertura-lineas.jpg",
      alt: "Cobertura Líneas"
    },
    mixto: {
      image: "./assets/cobertura-medio.jpg",
      alt: "Cobertura medio"
    },
    pleno: {
      image: "./assets/cobertura-pleno.jpg",
      alt: "Cobertura pleno"
    }
  };

  // Debe ser multiplo de 3: asi cada parte base64 se puede recomponer sin padding intermedio.
  const FILE_UPLOAD_CHUNK_BYTES = 768 * 1024;
  const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

  function setStatus(message, kind) {
    els.status.textContent = message || "";
    els.status.className = "status";
    if (kind) {
      els.status.classList.add(kind);
    }
  }

  function hideUploadProgress() {
    if (!els.uploadProgress) {
      return;
    }
    els.uploadProgress.classList.add("hidden");
    if (els.uploadProgressLabel) {
      els.uploadProgressLabel.textContent = "Subiendo archivos...";
    }
    if (els.uploadProgressPercent) {
      els.uploadProgressPercent.textContent = "0%";
    }
    if (els.uploadProgressFill) {
      els.uploadProgressFill.style.width = "0%";
    }
    const bar = els.uploadProgress.querySelector(".upload-progress-bar");
    if (bar) {
      bar.setAttribute("aria-valuenow", "0");
    }
  }

  function updateUploadProgress(progressPercent, label) {
    if (!els.uploadProgress) {
      return;
    }
    const safePercent = Math.max(0, Math.min(100, Math.round(Number(progressPercent) || 0)));
    els.uploadProgress.classList.remove("hidden");
    if (els.uploadProgressLabel) {
      els.uploadProgressLabel.textContent = label || "Subiendo archivos...";
    }
    if (els.uploadProgressPercent) {
      els.uploadProgressPercent.textContent = `${safePercent}%`;
    }
    if (els.uploadProgressFill) {
      els.uploadProgressFill.style.width = `${safePercent}%`;
    }
    const bar = els.uploadProgress.querySelector(".upload-progress-bar");
    if (bar) {
      bar.setAttribute("aria-valuenow", String(safePercent));
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

  function getSelectedFiles() {
    return Array.from(els.fileInput.files || []);
  }

  function getOversizedFile(files) {
    return (files || []).find((file) => (file.size || 0) > MAX_FILE_SIZE_BYTES) || null;
  }

  function updateFileMeta() {
    if (!els.fileMeta) {
      return;
    }
    const files = getSelectedFiles();
    if (els.uploadPanel) {
      els.uploadPanel.classList.toggle("is-mail-link-mode", Boolean(els.sendLinkLater && els.sendLinkLater.checked));
    }
    if (!files.length) {
      els.fileMeta.textContent = els.sendLinkLater && els.sendLinkLater.checked
        ? "No subiste archivos acá. Recordá enviarlos por Drive o WeTransfer a pedidos@29bis.com.ar cuando recibas el número de pedido."
        : "Aún no seleccionaste archivos.";
      updateProgressSteps();
      return;
    }
    const oversized = getOversizedFile(files);
    if (oversized) {
      els.fileMeta.textContent = `El archivo ${oversized.name} supera el máximo recomendado de 20 MB. Enviá el link por mail a pedidos@29bis.com.ar con tu número de pedido.`;
      updateProgressSteps();
      return;
    }
    const totalBytes = files.reduce((acc, file) => acc + (file.size || 0), 0);
    const names = files.slice(0, 2).map((file) => file.name).join(" · ");
    const suffix = files.length > 2 ? ` +${files.length - 2} más` : "";
    els.fileMeta.textContent = `${files.length} archivo(s) · ${formatBytes(totalBytes)} · ${names}${suffix}`;
    updateProgressSteps();
  }

  function updateProgressSteps() {
    if (!els.progressSteps || !els.progressSteps.length) {
      return;
    }

    const hasConfiguredWork = Boolean(getCurrentWorkSnapshot() || state.savedItems.length > 0);
    const files = getSelectedFiles();
    const hasValidFiles = Boolean(files.length > 0) && !getOversizedFile(files);
    const hasFiles = hasValidFiles || Boolean(els.sendLinkLater && els.sendLinkLater.checked);
    const hasCustomerData = Boolean(
      String(els.customerName.value || "").trim()
      && String(els.customerPhone.value || "").trim()
      && String(els.customerDni.value || "").trim()
      && String(els.customerEmail.value || "").trim()
    );
    const hasPayment = Boolean(getSelectedPaymentMethod());

    const step1Done = hasConfiguredWork;
    const step2Done = hasFiles;
    const step3Done = hasCustomerData && hasPayment;

    let activeStep = 1;
    if (step1Done && !step2Done) {
      activeStep = 2;
    } else if (step1Done && step2Done) {
      activeStep = 3;
    }

    els.progressSteps.forEach((stepEl) => {
      const stepNum = Number(stepEl.dataset.step || "0");
      const done = (stepNum === 1 && step1Done) || (stepNum === 2 && step2Done) || (stepNum === 3 && step3Done);
      stepEl.classList.toggle("is-complete", done);
      stepEl.classList.toggle("is-active", stepNum === activeStep);
    });
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

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function normalizeBool(value, fallback = true) {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    const text = String(value || "").trim().toLowerCase();
    if (["true", "1", "si", "sí", "yes"].includes(text)) {
      return true;
    }
    if (["false", "0", "no"].includes(text)) {
      return false;
    }
    return fallback;
  }

  function toNumber(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    const cleaned = String(value || "")
      .replace(/\s/g, "")
      .replace(/\$/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function patchPricingFromRows(basePricing, priceRows) {
    (priceRows || []).forEach((row) => {
      const machine = String(row.machine || "").trim();
      const paperKey = String(row.paper_key || "").trim();
      const sizeKey = String(row.size_key || "").trim();
      const coverageKey = String(row.coverage_key || "").trim();
      const sideKey = String(row.side_key || "").trim();
      const price = toNumber(row.price);
      if (!machine || !paperKey || !sizeKey || price == null) {
        return;
      }

      if (machine === "plotter") {
        if (!coverageKey) {
          return;
        }
        if (!basePricing.plotter.prices[sizeKey]) {
          basePricing.plotter.prices[sizeKey] = {};
        }
        if (!basePricing.plotter.prices[sizeKey][paperKey]) {
          basePricing.plotter.prices[sizeKey][paperKey] = {};
        }
        basePricing.plotter.prices[sizeKey][paperKey][coverageKey] = price;
        return;
      }

      if (machine === "laser") {
        if (paperKey === "obra_80") {
          if (!coverageKey || !sideKey) {
            return;
          }
          if (!basePricing.laser.common.prices[sizeKey]) {
            basePricing.laser.common.prices[sizeKey] = {};
          }
          if (!basePricing.laser.common.prices[sizeKey][coverageKey]) {
            basePricing.laser.common.prices[sizeKey][coverageKey] = {};
          }
          basePricing.laser.common.prices[sizeKey][coverageKey][sideKey] = price;
          return;
        }

        if (!sideKey) {
          return;
        }
        if (!basePricing.laser.special.prices[sizeKey]) {
          basePricing.laser.special.prices[sizeKey] = {};
        }
        if (!basePricing.laser.special.prices[sizeKey][paperKey]) {
          basePricing.laser.special.prices[sizeKey][paperKey] = {};
        }
        basePricing.laser.special.prices[sizeKey][paperKey][sideKey] = price;
      }
    });
  }

  async function loadPricingData() {
    const base = deepClone(fallbackData);
    runtimePaperAvailability = { ...(config.paperAvailabilityOverrides || {}) };

    if (config.pricesMode !== "remote-json" || !config.pricesJsonUrl) {
      return base;
    }

    try {
      const response = await fetch(config.pricesJsonUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("No se pudo leer el JSON remoto de precios.");
      }
      const remote = await response.json();

      if (remote && remote.mode === "price-rows" && Array.isArray(remote.priceRows)) {
        patchPricingFromRows(base, remote.priceRows);
        if (remote.paperAvailability && typeof remote.paperAvailability === "object") {
          Object.entries(remote.paperAvailability).forEach(([paperKey, isAvailable]) => {
            runtimePaperAvailability[paperKey] = normalizeBool(isAvailable, true);
          });
        }
        return base;
      }

      // Compatibilidad si algún día el endpoint devuelve estructura completa.
      if (remote && remote.machines && remote.papers && remote.laser && remote.plotter) {
        if (remote.paperAvailabilityOverrides && typeof remote.paperAvailabilityOverrides === "object") {
          runtimePaperAvailability = {
            ...runtimePaperAvailability,
            ...remote.paperAvailabilityOverrides
          };
        }
        return remote;
      }

      return base;
    } catch (err) {
      setStatus(`${err.message} Se usará la tabla local.`, "error");
      return base;
    }
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
    if (Object.prototype.hasOwnProperty.call(runtimePaperAvailability || {}, paperKey)) {
      return Boolean(runtimePaperAvailability[paperKey]);
    }
    return true;
  }

  function usesCoverage(machineKey, paperKey, sideKey) {
    if (isPlotter(machineKey)) {
      return true;
    }
    // Regla comercial: láser + obra 80gr + doble faz se cotiza con precio único (sin coberturas).
    if (isLaser(machineKey) && paperKey === "obra_80" && sideKey === "df") {
      return false;
    }
    return isLaser(machineKey) && paperKey === "obra_80";
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
    els.customAreaPreview.textContent = `Área: ${areaM2.toFixed(2)} m² (${widthM.toFixed(2)} m x ${heightM.toFixed(2)} m)`;
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
    const machineLabel = getMachineLabel(els.machine.value);
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

  function getMachineLabel(machineKey) {
    if (machineKey === "laser") {
      return "Laser";
    }
    if (machineKey === "plotter") {
      return "Plotter";
    }
    return pricing.machines[machineKey]?.label || machineKey;
  }

  function buildMachineOptions() {
    clearSelect(els.machine);
    Object.entries(pricing.machines).forEach(([machineKey, machine]) => {
      els.machine.appendChild(createOption(machineKey, getMachineLabel(machineKey)));
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
    const showCoverage = usesCoverage(machineKey, paperKey, els.sides.value);

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
    if (!usesCoverage(machineKey, paperKey, els.sides.value)) {
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
    const withCoverage = usesCoverage(machineKey, paperKey, sideKey);

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
      const unit = getUnitPrice({
        machineKey,
        paperKey,
        sizeKey,
        sideKey,
        coverageKey: isLaser(machineKey) && paperKey === "obra_80" ? "lineas" : undefined
      });
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
        label: getMachineLabel(machineKey)
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
      coverageDistribution: usesCoverage(machineKey, paperKey, sideKey) ? getCoverageDistribution() : [],
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
    if (usesCoverage(els.machine.value, els.paper.value, els.sides.value)) {
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
      ["Tipo de impresion", getMachineLabel(els.machine.value)],
      ["Papel", getPaperLabel(els.paper.value)],
      ["Tamano", getSizeLabel(els.size.value)],
      ["Faz", sideText],
      ["Hojas totales (pedido)", String(aggregated.totalSheets)]
    ];
    if (isCustomPlotterSize()) {
      const custom = getCustomDimensions();
      rows.splice(3, 0, ["Medida personalizada", `${custom.widthM.toFixed(2)} m x ${custom.heightM.toFixed(2)} m`]);
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

  function postOrdersWebhook(payload) {
    return fetch(config.ordersWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
  }

  function readBlobAsBase64(blob, fileName) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.onerror = () => {
        reject(new Error(`No se pudo leer el archivo: ${fileName || "archivo"}`));
      };
      reader.readAsDataURL(blob);
    });
  }

  async function requestUploadAction(payload) {
    const response = await postOrdersWebhook(payload);
    if (!response.ok) {
      throw new Error("No se pudo subir el archivo al servidor.");
    }
    const data = await response.json();
    if (!data.ok) {
      const detail = data.detail ? ` ${data.detail}` : "";
      throw new Error(`${data.message || "No se pudo subir el archivo."}${detail}`);
    }
    return data;
  }

  async function uploadSingleFileInChunks(file, sessionId, fileIndex, totalFiles, progressState) {
    const uploadId = `${sessionId}-file-${fileIndex + 1}`;
    const fileSize = file.size || 0;
    let uploadedBytesForFile = 0;

    await requestUploadAction({
      action: "upload_init",
      sessionId,
      uploadId,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size || 0
    });

    const totalChunks = Math.max(1, Math.ceil(fileSize / FILE_UPLOAD_CHUNK_BYTES));
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const start = chunkIndex * FILE_UPLOAD_CHUNK_BYTES;
      const end = Math.min(fileSize, start + FILE_UPLOAD_CHUNK_BYTES);
      const blobChunk = file.slice(start, end);
      const base64Chunk = await readBlobAsBase64(blobChunk, file.name);

      await requestUploadAction({
        action: "upload_chunk",
        sessionId,
        uploadId,
        chunkIndex,
        chunkData: base64Chunk
      });

      uploadedBytesForFile += blobChunk.size || 0;
      const totalUploaded = Math.min(
        progressState.totalBytes,
        (progressState.completedBytes || 0) + uploadedBytesForFile
      );
      const percent = progressState.totalBytes ? (totalUploaded / progressState.totalBytes) * 100 : 100;
      setStatus(`Subiendo archivo ${fileIndex + 1} de ${totalFiles}: ${file.name}`, "loading");
      updateUploadProgress(percent, `Subiendo archivo ${fileIndex + 1} de ${totalFiles}`);
    }

    const result = await requestUploadAction({
      action: "upload_finish",
      sessionId,
      uploadId
    });

    progressState.completedBytes = (progressState.completedBytes || 0) + fileSize;
    const completedPercent = progressState.totalBytes
      ? (progressState.completedBytes / progressState.totalBytes) * 100
      : 100;
    updateUploadProgress(completedPercent, `Archivo ${fileIndex + 1} de ${totalFiles} subido`);

    return {
      id: result.file && result.file.id ? result.file.id : "",
      url: result.file && result.file.url ? result.file.url : "",
      name: result.file && result.file.name ? result.file.name : file.name,
      mimeType: result.file && result.file.mimeType ? result.file.mimeType : (file.type || "application/octet-stream"),
      sizeBytes: result.file && result.file.sizeBytes ? result.file.sizeBytes : (file.size || 0)
    };
  }

  async function uploadFilesForOrder(fileList, sessionId) {
    const files = Array.from(fileList || []);
    if (!files.length || !config.ordersWebhookUrl) {
      return files.map((file) => ({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size || 0
      }));
    }

    const progressState = {
      totalBytes: files.reduce((acc, file) => acc + (file.size || 0), 0),
      completedBytes: 0
    };
    updateUploadProgress(0, files.length > 1 ? "Preparando archivos..." : "Preparando archivo...");
    const uploadedFiles = [];
    for (let index = 0; index < files.length; index += 1) {
      uploadedFiles.push(await uploadSingleFileInChunks(files[index], sessionId, index, files.length, progressState));
    }
    updateUploadProgress(100, "Archivos subidos");
    return uploadedFiles;
  }

  function updatePaymentUI() {
    const method = getSelectedPaymentMethod();
    const isTransfer = method?.key === "transferencia";
    const isLocal = method?.key === "local";
    els.paymentTransferInfo.classList.toggle("hidden", !isTransfer);
    els.paymentLocalInfo.classList.toggle("hidden", !isLocal);
    updateProgressSteps();
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function getPickupOptionLabel(dateObj, hourMinute) {
    const day = pad2(dateObj.getDate());
    const month = pad2(dateObj.getMonth() + 1);
    const year = dateObj.getFullYear();
    const weekdayLabel = dateObj.toLocaleDateString("es-AR", { weekday: "long" });
    return `${weekdayLabel} ${day}/${month}/${year} · ${hourMinute}`;
  }

  function getPickupOptionValue(dateObj, hourMinute) {
    const year = dateObj.getFullYear();
    const month = pad2(dateObj.getMonth() + 1);
    const day = pad2(dateObj.getDate());
    return `${year}-${month}-${day}T${hourMinute}`;
  }

  function buildPickupOptions() {
    if (!els.pickupDatetime) {
      return;
    }

    clearSelect(els.pickupDatetime);
    els.pickupDatetime.appendChild(createOption("", "Sin fecha (trabajo urgente)"));

    const allowedDays = new Set((pickupSchedule.allowedWeekdays || []).map((d) => Number(d)));
    const slots = Array.isArray(pickupSchedule.slots) ? pickupSchedule.slots : [];
    const daysAhead = Math.max(1, Number(pickupSchedule.daysAhead || 21));
    const now = new Date();

    for (let offset = 0; offset <= daysAhead; offset += 1) {
      const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      const weekday = currentDate.getDay();
      if (!allowedDays.has(weekday)) {
        continue;
      }

      slots.forEach((hourMinute) => {
        const [hh, mm] = String(hourMinute).split(":").map((v) => Number(v));
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
          return;
        }

        const optionDate = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          currentDate.getDate(),
          hh,
          mm,
          0,
          0
        );

        // Evita ofrecer horarios ya pasados el mismo día
        if (optionDate.getTime() <= now.getTime()) {
          return;
        }

        els.pickupDatetime.appendChild(
          createOption(
            getPickupOptionValue(currentDate, hourMinute),
            getPickupOptionLabel(currentDate, hourMinute)
          )
        );
      });
    }
  }

  function validateForm() {
    if (!els.form.checkValidity()) {
      els.form.reportValidity();
      return false;
    }

    const paymentMethod = getSelectedPaymentMethod();
    if (!paymentMethod) {
      setStatus("Seleccioná una forma de pago: transferencia bancaria o pagar en el local.", "error");
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

    const files = getSelectedFiles();
    const oversized = getOversizedFile(files);
    if (oversized) {
      setStatus(`El archivo ${oversized.name} supera el máximo recomendado de 20 MB. Completá el pedido sin adjuntarlo y después enviá el link de Drive o WeTransfer a pedidos@29bis.com.ar con tu número de pedido.`, "error");
      return false;
    }

    if (!files.length && !(els.sendLinkLater && els.sendLinkLater.checked)) {
      setStatus("Adjuntá al menos un archivo o marcá la opción para enviar el link de Drive o WeTransfer por mail después del pedido.", "error");
      return false;
    }

    const currentWork = getCurrentWorkSnapshot();
    if (!currentWork && state.savedItems.length === 0) {
      setStatus("Agregá al menos un trabajo con cantidad de hojas mayor a 0.", "error");
      return false;
    }

    return true;
  }

  async function buildOrderPayload(orderItems, uploadedFiles, uploadSessionId) {
    const urgent = !els.pickupDatetime.value;
    const pricingTotals = getAggregatedPricing(orderItems);
    const paymentMethod = getSelectedPaymentMethod();
    const firstFileName = uploadedFiles[0] ? uploadedFiles[0].name : null;
    const externalFilesByEmail = Boolean(els.sendLinkLater && els.sendLinkLater.checked && !uploadedFiles.length);

    return {
      orderId: `${Date.now()}`,
      uploadSessionId: uploadSessionId || "",
      createdAt: new Date().toISOString(),
      orderItems,
      customer: {
        name: els.customerName.value.trim(),
        phone: els.customerPhone.value.trim(),
        dni: els.customerDni.value.trim(),
        email: els.customerEmail.value.trim()
      },
      pickupDateTime: els.pickupDatetime.value || null,
      urgent,
      payment: paymentMethod,
      externalFilesByEmail,
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

    const response = await postOrdersWebhook(payload);

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
      orderNumber: data.orderNumber || payload.orderId,
      mailSent: Boolean(data.mailSent),
      mailError: data.mailError || ""
    };
  }

  function saveLocalPreview(payload) {
    const raw = localStorage.getItem("orders-29bis");
    const list = raw ? JSON.parse(raw) : [];
    list.unshift(payload);
    localStorage.setItem("orders-29bis", JSON.stringify(list.slice(0, 30)));
  }

  function formatDateTimeAr(value) {
    if (!value) {
      return "Sin fecha/hora (trabajo urgente)";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Sin fecha/hora (trabajo urgente)";
    }
    return date.toLocaleString("es-AR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  function summarizeFileNamesForConfirmation(fileNames) {
    const clean = (Array.isArray(fileNames) ? fileNames : []).map((name) => String(name || "").trim()).filter(Boolean);
    if (!clean.length) {
      return "Sin detalle";
    }
    if (clean.length <= 2) {
      return clean.join(", ");
    }
    return `${clean[0]}, ${clean[1]} (+${clean.length - 2})`;
  }

  function normalizeOrderNumber(orderNumber) {
    return String(orderNumber || "").replace(/^29BIS-/i, "");
  }

  function buildConfirmationData(payload, result) {
    const total = payload && payload.pricing && payload.pricing.total ? payload.pricing.total : 0;
    const totalSheets = payload && payload.pricing && payload.pricing.totalSheets ? payload.pricing.totalSheets : 0;
    const paymentLabel = payload && payload.payment && payload.payment.label ? payload.payment.label : "-";
    const paymentKey = payload && payload.payment && payload.payment.key ? payload.payment.key : "";
    const pickupLabel = formatDateTimeAr(payload ? payload.pickupDateTime : null);
    const fileNames = payload && Array.isArray(payload.fileNames) ? payload.fileNames : [];
    const externalFilesByEmail = Boolean(payload && payload.externalFilesByEmail);

    return {
      orderNumber: normalizeOrderNumber(result && result.orderNumber ? result.orderNumber : (payload ? payload.orderId : "-")),
      customerName: payload && payload.customer && payload.customer.name ? payload.customer.name : "Cliente",
      totalSheets,
      totalFormatted: currency.format(total),
      paymentLabel,
      paymentKey,
      pickupLabel,
      filesSummary: externalFilesByEmail ? "Se enviarán por mail (Drive o WeTransfer)" : summarizeFileNamesForConfirmation(fileNames),
      externalFilesByEmail,
      mailSent: Boolean(result && result.mailSent),
      mailError: result && result.mailError ? result.mailError : ""
    };
  }

  function openOrderConfirmationPage(confirmationData) {
    const storageKey = `order-confirmation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(storageKey, JSON.stringify(confirmationData));
    const confirmationUrl = `./confirmacion.html?id=${encodeURIComponent(storageKey)}`;

    const opened = window.open(confirmationUrl, "_blank", "noopener");
    if (!opened) {
      window.location.href = confirmationUrl;
    }
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

    els.sides.addEventListener("change", () => {
      toggleConditionalFields();
      updateSummary();
    });
    els.quantity.addEventListener("input", updateSummary);
    els.customWidth.addEventListener("input", updateSummary);
    els.customHeight.addEventListener("input", updateSummary);
    els.fileInput.addEventListener("change", updateFileMeta);
    if (els.sendLinkLater) {
      els.sendLinkLater.addEventListener("change", updateFileMeta);
    }
    els.paymentMethodRadios.forEach((radio) => {
      radio.addEventListener("change", updatePaymentUI);
    });
    [els.customerName, els.customerPhone, els.customerDni, els.customerEmail].forEach((input) => {
      input.addEventListener("input", updateProgressSteps);
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
      if (state.isSubmitting) {
        return;
      }
      state.isSubmitting = true;
      setStatus("");
      hideUploadProgress();

      try {
        updateSummary();
        if (!validateForm()) {
          return;
        }

        const orderItems = [...state.savedItems];
        const currentWork = getCurrentWorkSnapshot();
        if (currentWork) {
          orderItems.push(currentWork);
        }

        const submitBtn = document.getElementById("submit-order-btn") || els.form.querySelector("button[type='submit']");
        submitBtn.disabled = true;
        submitBtn.textContent = "Enviando...";

        const uploadSessionId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const uploadedFiles = await uploadFilesForOrder(els.fileInput.files, uploadSessionId);
        setStatus("Enviando pedido...", "loading");
        updateUploadProgress(100, "Preparando pedido...");
        const payload = await buildOrderPayload(orderItems, uploadedFiles, uploadSessionId);

        const result = await submitOrder(payload);
        const confirmationData = buildConfirmationData(payload, result);
        if (result.mode === "local-preview") {
          saveLocalPreview(payload);
          setStatus("Pedido generado en modo local de prueba.", "ok");
        } else {
          const displayOrderNumber = normalizeOrderNumber(result.orderNumber);
          const orderNumberText = displayOrderNumber ? `Tu número de pedido es ${displayOrderNumber}.` : "Tu pedido fue enviado correctamente.";
          const mailText = result.mailSent
            ? " Te enviamos un email con el resumen del pedido."
            : ` Pedido registrado, pero no pudimos enviar el email automático.${result.mailError ? ` (${result.mailError})` : ""}`;
          setStatus(`${orderNumberText}${mailText}`, "ok");
        }
        hideUploadProgress();
        openOrderConfirmationPage(confirmationData);
        els.form.reset();
        state.savedItems = [];
        state.showItemsPanel = false;
        renderItemsPanel();
        buildPickupOptions();
        els.paymentMethodRadios.forEach((radio) => { radio.checked = false; });
        updatePaymentUI();
        Object.values(state.coverageInputs).forEach((input) => { input.value = "0"; });
        els.quantity.value = "";
        els.customWidth.value = "";
        els.customHeight.value = "";
        updateFileMeta();
        syncUI();
      } catch (err) {
        hideUploadProgress();
        const msg = String(err && err.message ? err.message : "");
        if (/Failed to fetch/i.test(msg)) {
          setStatus("No se pudo confirmar la respuesta de Google Apps Script. El pedido puede haberse guardado igual: revisá la planilla antes de reenviarlo. Si no entró, probá de nuevo o revisá el deploy de la Aplicación web.", "error");
        } else {
          setStatus(err.message || "Error al enviar el pedido.", "error");
        }
      } finally {
        const submitBtn = document.getElementById("submit-order-btn") || els.form.querySelector("button[type='submit']");
        submitBtn.disabled = false;
        submitBtn.textContent = "Enviar pedido";
        state.isSubmitting = false;
      }
    });
  }

  async function init() {
    pricing = await loadPricingData();
    buildMachineOptions();
    buildSidesOptions();
    buildCoverageInputs();
    buildPickupOptions();
    bindEvents();
    updateFileMeta();
    updatePaymentUI();
    syncUI();
  }

  init();
})();



