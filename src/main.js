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
    paymentMpInfo: document.getElementById("payment-mp-info"),
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
    servicesPanel: document.getElementById("services-panel"),
    servicesList: document.getElementById("services-list"),
    servicesLead: document.getElementById("services-lead"),
    servicesBadge: document.getElementById("services-badge"),
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
    jobFiles: new Map(),
    services: { selected: {} },
    servicesSignature: "",
    leadDays: 0,
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

  // ---- Archivos por trabajo ----
  function getJobEntry(itemId) {
    return state.jobFiles.get(itemId) || { files: [], linkLater: false };
  }

  function jobHasFiles(itemId) {
    const entry = getJobEntry(itemId);
    return entry.files.length > 0 || entry.linkLater;
  }

  function updateUploadTitle() {
    const titleEl = document.getElementById("upload-title");
    const badgeEl = document.getElementById("upload-job-badge");
    const n = state.savedItems.length + 1;
    if (titleEl) {
      titleEl.textContent = state.savedItems.length
        ? `Archivo(s) del Trabajo ${n}`
        : "Archivo(s) para impresión";
    }
    if (badgeEl) {
      badgeEl.textContent = `Trabajo ${n}`;
      badgeEl.classList.toggle("hidden", state.savedItems.length === 0);
    }
  }

  // Devuelve los trabajos del pedido con sus archivos: los ya agregados + el que se está armando.
  function collectJobs() {
    const jobs = state.savedItems.map((item) => {
      const entry = getJobEntry(item.id);
      return { item, files: entry.files, linkLater: entry.linkLater };
    });
    const currentWork = getCurrentWorkSnapshot();
    if (currentWork) {
      const files = getSelectedFiles();
      jobs.push({
        item: currentWork,
        files,
        linkLater: !files.length && Boolean(els.sendLinkLater && els.sendLinkLater.checked)
      });
    }
    return jobs;
  }

  function updateFileMeta() {
    updateUploadTitle();
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
    const currentOk = hasValidFiles || Boolean(els.sendLinkLater && els.sendLinkLater.checked);
    const savedOk = state.savedItems.every((item) => jobHasFiles(item.id));
    const hasFiles = savedOk && (currentOk || (!getCurrentWorkSnapshot() && state.savedItems.length > 0));
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
        applyServicePricesFromRows(remote.priceRows);
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

  // En algunos papeles el tamaño SA3 se muestra con otro nombre (solo cambia el texto, no el precio ni el código).
  const SIZE_LABEL_OVERRIDES = {
    vegetal: { SA3: "A3" }
  };

  function getSizeLabel(sizeKey) {
    const byPaper = SIZE_LABEL_OVERRIDES[els.paper.value];
    if (byPaper && byPaper[sizeKey] && els.machine.value === "laser") {
      return byPaper[sizeKey];
    }
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


  // ============================================================
  // SERVICIOS ADICIONALES (anillado, empanelado, laminado, etc.)
  // Los precios y reglas están en src/services-data.js
  // ============================================================
  let servicesData = window.SERVICES_DATA ? deepClone(window.SERVICES_DATA) : null;

  const SERVICE_TEXTS = {
    acabado: { brillante: "brillante", mate: "mate" },
    faz: { sf: "simple faz", df: "doble faz" },
    posicion: {
      medio: "al medio (acaballado)",
      izquierdo: "en el costado izquierdo",
      derecho: "en el costado derecho",
      arriba: "arriba",
      abajo: "abajo",
      otro: "otra posición (aclarar en observaciones)"
    },
    marcas: {
      con_marcas: "el archivo trae marcas de corte",
      sin_marcas: "refilar al ras del diseño (sin marcas)"
    }
  };


  // ---- Precios y plazos de servicios desde la hoja "prices" (filas con Tipo = "servicio") ----
  function applyServicePricesFromRows(rows) {
    if (!servicesData) {
      return;
    }
    const svc = servicesData.services;
    const anyActive = {};
    const seenKeys = {};
    (rows || []).forEach((row) => {
      if (String(row.machine || "").trim() !== "servicio") {
        return;
      }
      const key = String(row.paper_key || "").trim().toLowerCase();
      const def = svc[key];
      if (!def) {
        return;
      }
      seenKeys[key] = true;
      if (row.active !== false) {
        anyActive[key] = true;
      }
      const size = String(row.size_key || "").trim();
      const concept = String(row.coverage_key || "").trim().toLowerCase();
      const faz = String(row.side_key || "").trim().toLowerCase();
      const price = toNumber(row.price);
      if (price == null) {
        return;
      }
      if (concept === "dias") {
        def.days = price;
      } else if (key === "anillado" || key === "abrochado") {
        if (concept === "trabajo") {
          def.price = price;
        } else if (concept === "max_hojas_acaballado") {
          def.maxSheetsAcaballado = price;
        }
      } else if (key === "empanelado") {
        if (def.supports[concept]) {
          def.supports[concept].pricePerM2 = price;
        }
      } else if (key === "laminado") {
        if (concept === "hoja" && def.priceBySize[size] && (faz === "sf" || faz === "df")) {
          def.priceBySize[size][faz] = price;
        }
      } else if (key === "refilado") {
        if (concept === "hoja") {
          def.pricePerSheet = price;
        } else if (concept === "con_abrochado") {
          def.priceWithAbrochado = price;
        }
      } else if (key === "troquelado") {
        if (concept === "hoja" && def.priceBySize[size] !== undefined) {
          def.priceBySize[size] = price;
        } else if (concept === "descuento_porcentaje") {
          def.discount.rate = price / 100;
        } else if (concept === "descuento_desde_hojas") {
          def.discount.minSheets = price;
        } else if (concept === "demora_mas_de_hojas") {
          def.daysOver.sheets = price;
        } else if (concept === "demora_dias") {
          def.daysOver.days = price;
        }
      }
    });
    // Un servicio con todas sus filas en "Disponible = NO" deja de ofrecerse.
    Object.keys(seenKeys).forEach((key) => {
      svc[key].disabled = !anyActive[key];
    });
  }

  function getServicePriceHint(key) {
    const def = servicesData.services[key];
    if (key === "anillado" || key === "abrochado") {
      return `${currency.format(def.price)} por trabajo`;
    }
    if (key === "empanelado") {
      const min = Math.min(...Object.values(def.supports).map((sp) => sp.pricePerM2));
      return `desde ${currency.format(min)} por m²`;
    }
    if (key === "laminado") {
      const all = [];
      Object.values(def.priceBySize).forEach((o) => { all.push(o.sf, o.df); });
      return `desde ${currency.format(Math.min(...all.filter((n) => n > 0)))} por hoja`;
    }
    if (key === "refilado") {
      return `${currency.format(def.pricePerSheet)} por hoja (${currency.format(def.priceWithAbrochado)} si va con abrochado)`;
    }
    if (key === "troquelado") {
      return `desde ${currency.format(Math.min(...Object.values(def.priceBySize)))} por hoja`;
    }
    return "";
  }

  function formatLeadText(days) {
    return days >= 5 ? "1 semana" : `${days} día${days === 1 ? "" : "s"} hábil${days === 1 ? "" : "es"}`;
  }

  function getServiceInfo(key) {
    const def = servicesData.services[key];
    if (key === "troquelado") {
      return `Solo en autoadhesivos. Con más de ${def.daysOver.sheets} hojas la demora es de ${formatLeadText(def.daysOver.days)}. Desde ${def.discount.minSheets} hojas del mismo diseño tenés ${Math.round(def.discount.rate * 100)}% de descuento.`;
    }
    return def.info || "";
  }

  function serviceDefaultOptions(key) {
    if (key === "laminado") {
      return { acabado: "brillante", faz: "sf", cantidadModo: "todas", cantidadOtra: 1 };
    }
    if (key === "abrochado") {
      return { posicion: "" };
    }
    if (key === "refilado") {
      return { marcas: "" };
    }
    if (key === "empanelado") {
      return { soporte: "carton_corrugado", calado: false };
    }
    if (key === "troquelado") {
      return { mismoDiseno: false };
    }
    return {};
  }

  function getMaxSheetsAcaballado() {
    return (servicesData && servicesData.services.abrochado && Number(servicesData.services.abrochado.maxSheetsAcaballado)) || 40;
  }

  // El abrochado al medio (acaballado) deja la tapa plegada: solo se laminan/cuentan así si va al medio.
  function isAcaballado() {
    const sel = state.services.selected.abrochado;
    return Boolean(sel && sel.posicion === "medio");
  }

  function getServiceCtx() {
    return {
      machineKey: els.machine.value,
      paperKey: els.paper.value,
      sizeKey: els.size.value,
      custom: isCustomPlotterSize(),
      totalSheets: getQuantityTotal()
    };
  }

  function isServiceAvailable(key, ctx) {
    const def = servicesData.services[key];
    if (!def || def.disabled) {
      return false;
    }
    if (def.machine && def.machine !== ctx.machineKey) {
      return false;
    }
    if (def.noCustomSize && ctx.custom) {
      return false;
    }
    if (def.sizes && !def.sizes.includes(ctx.sizeKey)) {
      return false;
    }
    if (def.papers && !def.papers.includes(ctx.paperKey)) {
      return false;
    }
    return true;
  }

  function areServicesCompatible(a, b) {
    return servicesData.compat.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  }

  function getAvailableServiceKeys(ctx) {
    return Object.keys(servicesData.services).filter((key) => isServiceAvailable(key, ctx));
  }

  function pruneServiceState(ctx) {
    const available = new Set(getAvailableServiceKeys(ctx));
    Object.keys(state.services.selected).forEach((key) => {
      if (!available.has(key)) {
        delete state.services.selected[key];
      }
    });
    // "Solo tapas" del laminado solo existe si hay anillado o abrochado; si se quitó, vuelve a "todas".
    const lam = state.services.selected.laminado;
    if (lam && lam.cantidadModo === "tapas" && !state.services.selected.anillado && !state.services.selected.abrochado) {
      lam.cantidadModo = "todas";
    }
    // Si quedaron dos servicios que no se combinan, se conserva el primero.
    const keys = Object.keys(servicesData.services).filter((key) => state.services.selected[key]);
    keys.forEach((key) => {
      const conflict = keys.some((other) => other !== key && state.services.selected[other] && !areServicesCompatible(key, other) && keys.indexOf(other) < keys.indexOf(key));
      if (conflict) {
        delete state.services.selected[key];
      }
    });
  }

  function getSelectedServiceKeys() {
    return Object.keys(servicesData.services).filter((key) => state.services.selected[key]);
  }

  function getServiceDisabledReason(key) {
    const selected = getSelectedServiceKeys().filter((other) => other !== key);
    const blocker = selected.find((other) => !areServicesCompatible(key, other));
    if (!blocker) {
      return "";
    }
    return `No se combina con ${servicesData.services[blocker].label}.`;
  }

  function clampInt(value, min, max) {
    const n = Math.floor(Number(value) || 0);
    return Math.max(min, Math.min(max, n));
  }

  function computeService(key, ctx, selectedKeys) {
    const def = servicesData.services[key];
    const opts = Object.assign(serviceDefaultOptions(key), state.services.selected[key] || {});
    const sheets = ctx.totalSheets;
    const result = { key, label: def.label, detail: def.label, quantity: 1, total: 0, error: "", priceRef: null };

    if (key === "anillado") {
      result.total = def.price;
      result.priceRef = { size: "todos", concept: "trabajo", faz: "", unit: def.price };
      result.detail = "Anillado (doble alambre, tapas plásticas)";
    } else if (key === "empanelado") {
      const support = def.supports[opts.soporte] || def.supports.carton_corrugado;
      const area = def.sizeAreaM2[ctx.sizeKey];
      if (!area) {
        result.error = "No se puede calcular el empanelado para este tamaño. Consultanos.";
      } else {
        result.quantity = sheets;
        result.priceRef = { size: "todos", concept: Object.keys(def.supports).find((k) => def.supports[k] === support) || "carton_corrugado", faz: "", unit: support.pricePerM2 };
        result.total = Math.round(area * sheets * support.pricePerM2);
        result.detail = `Empanelado en ${support.label.toLowerCase()}${opts.calado ? " · calado en el centro" : ""} · ${sheets} hoja${sheets === 1 ? "" : "s"}`;
      }
    } else if (key === "laminado") {
      const unit = (def.priceBySize[ctx.sizeKey] || {})[opts.faz] || 0;
      const hasAbrochado = selectedKeys.includes("abrochado") && isAcaballado();
      let qty = sheets;
      let modeText = "";
      if (opts.cantidadModo === "tapas") {
        qty = Math.min(hasAbrochado ? 1 : 2, sheets);
        modeText = hasAbrochado ? " (solo la tapa)" : " (tapa y contratapa)";
      } else if (opts.cantidadModo === "otra") {
        qty = clampInt(opts.cantidadOtra, 1, Math.max(1, sheets));
      }
      result.quantity = qty;
      result.priceRef = { size: ctx.sizeKey, concept: "hoja", faz: opts.faz, unit };
      result.total = unit * qty;
      result.detail = `Laminado ${SERVICE_TEXTS.acabado[opts.acabado] || ""} ${SERVICE_TEXTS.faz[opts.faz] || ""} · ${qty} hoja${qty === 1 ? "" : "s"}${modeText}`;
    } else if (key === "abrochado") {
      result.total = def.price;
      result.priceRef = { size: "todos", concept: "trabajo", faz: "", unit: def.price };
      if (!opts.posicion) {
        result.error = "Elegí dónde va el abrochado.";
      } else if (opts.posicion === "medio" && sheets > getMaxSheetsAcaballado()) {
        result.error = `El abrochado al medio (acaballado) se puede hacer hasta ${getMaxSheetsAcaballado()} hojas. Elegí otra posición o reducí las hojas.`;
      }
      result.detail = `Abrochado ${SERVICE_TEXTS.posicion[opts.posicion] || ""}`.trim();
    } else if (key === "refilado") {
      const withStaple = selectedKeys.includes("abrochado");
      result.quantity = sheets;
      result.total = withStaple ? def.priceWithAbrochado : def.pricePerSheet * sheets;
      result.priceRef = { size: "todos", concept: withStaple ? "con_abrochado" : "hoja", faz: "", unit: withStaple ? def.priceWithAbrochado : def.pricePerSheet };
      if (!opts.marcas) {
        result.error = "En Refilado, aclará si tu archivo trae marcas de corte.";
      }
      result.detail = withStaple
        ? `Refilado (junto con abrochado) · ${SERVICE_TEXTS.marcas[opts.marcas] || ""}`.trim()
        : `Refilado · ${sheets} hoja${sheets === 1 ? "" : "s"} · ${SERVICE_TEXTS.marcas[opts.marcas] || ""}`.trim();
    } else if (key === "troquelado") {
      const unit = def.priceBySize[ctx.sizeKey] || 0;
      result.quantity = sheets;
      result.priceRef = { size: ctx.sizeKey, concept: "hoja", faz: "", unit };
      const gross = unit * sheets;
      const disc = def.discount;
      const hasDiscount = Boolean(opts.mismoDiseno && disc && sheets >= disc.minSheets);
      result.total = hasDiscount ? Math.round(gross * (1 - disc.rate)) : gross;
      result.detail = `Troquelado · ${sheets} hoja${sheets === 1 ? "" : "s"}${hasDiscount ? ` · ${Math.round(disc.rate * 100)}% de descuento (mismo diseño)` : ""}`;
    }
    return result;
  }

  // Estado completo de servicios del trabajo que se está armando.
  function getServicesState() {
    if (!servicesData) {
      return { list: [], total: 0, error: "" };
    }
    const ctx = getServiceCtx();
    const keys = getSelectedServiceKeys().filter((key) => isServiceAvailable(key, ctx));
    const list = keys.map((key) => computeService(key, ctx, keys));
    const firstError = list.find((entry) => entry.error);
    return {
      list,
      total: list.reduce((acc, entry) => acc + (entry.error ? 0 : entry.total), 0),
      error: firstError ? firstError.error : ""
    };
  }

  function getServiceDays(key, totalSheets) {
    const def = servicesData.services[key];
    if (!def) {
      return 0;
    }
    if (def.daysOver && totalSheets > def.daysOver.sheets) {
      return def.daysOver.days;
    }
    return def.days || 0;
  }

  // Dentro de un trabajo vale el servicio que más demora. Entre trabajos, los servicios
  // distintos suman días; el mismo servicio repetido en otro trabajo no vuelve a sumar.
  function computeLeadDays(jobs) {
    if (!servicesData) {
      return 0;
    }
    const seen = new Set();
    let total = 0;
    jobs.forEach((job) => {
      const services = job.services || [];
      let jobDays = 0;
      services.forEach((service) => {
        if (!seen.has(service.key)) {
          jobDays = Math.max(jobDays, getServiceDays(service.key, job.totalSheets || 0));
        }
      });
      services.forEach((service) => seen.add(service.key));
      total += jobDays;
    });
    return total;
  }

  function getAllJobsForLeadDays() {
    const jobs = state.savedItems.map((item) => ({
      services: item.services || [],
      totalSheets: item.pricing ? item.pricing.totalSheets : 0
    }));
    const sv = getServicesState();
    if (sv.list.length) {
      jobs.push({ services: sv.list, totalSheets: getQuantityTotal() });
    }
    return jobs;
  }

  function getEarliestPickupDate(businessDays) {
    const allowed = new Set((pickupSchedule.allowedWeekdays || []).map((d) => Number(d)));
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    let counted = 0;
    let guard = 0;
    while (counted < businessDays && guard < 400) {
      date.setDate(date.getDate() + 1);
      guard += 1;
      if (allowed.has(date.getDay())) {
        counted += 1;
      }
    }
    return date;
  }

  function syncLeadDays() {
    if (!servicesData) {
      return;
    }
    const days = computeLeadDays(getAllJobsForLeadDays());
    if (els.servicesLead) {
      if (days > 0) {
        const from = getEarliestPickupDate(days);
        const fromText = from.toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "2-digit" });
        els.servicesLead.textContent = `Por los servicios elegidos, tu pedido necesita ${days} día${days === 1 ? "" : "s"} hábil${days === 1 ? "" : "es"} de producción: podés retirarlo desde el ${fromText}.`;
        els.servicesLead.classList.remove("hidden");
      } else {
        els.servicesLead.classList.add("hidden");
      }
    }
    if (days !== state.leadDays) {
      const previous = els.pickupDatetime.value;
      state.leadDays = days;
      buildPickupOptions();
      if (previous && !Array.from(els.pickupDatetime.options).some((opt) => opt.value === previous)) {
        setStatus("Cambió el plazo por los servicios elegidos. Elegí de nuevo la fecha de retiro.", "error");
      }
    }
  }

  function optionHtml(value, label, selected) {
    return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function buildServiceOptionsHtml(key, ctx, selectedKeys) {
    const opts = Object.assign(serviceDefaultOptions(key), state.services.selected[key] || {});
    const def = servicesData.services[key];
    if (key === "laminado") {
      const hasBinding = selectedKeys.includes("anillado") || selectedKeys.includes("abrochado");
      const tapasLabel = selectedKeys.includes("abrochado") && isAcaballado()
        ? "Solo la tapa (queda acaballada, cuenta 1 hoja)"
        : "Solo tapa y contratapa (2 hojas)";
      return `
        <div class="service-options">
          <label><span>Acabado</span><select data-opt="acabado">${optionHtml("brillante", "Brillante", opts.acabado === "brillante")}${optionHtml("mate", "Mate", opts.acabado === "mate")}</select></label>
          <label><span>Faz</span><select data-opt="faz">${optionHtml("sf", "Simple faz", opts.faz === "sf")}${optionHtml("df", "Doble faz", opts.faz === "df")}</select></label>
          <label><span>¿Qué hojas laminar?</span><select data-opt="cantidadModo">
            ${optionHtml("todas", `Todas las hojas (${ctx.totalSheets})`, opts.cantidadModo === "todas")}
            ${hasBinding ? optionHtml("tapas", tapasLabel, opts.cantidadModo === "tapas") : ""}
            ${optionHtml("otra", "Otra cantidad", opts.cantidadModo === "otra")}
          </select></label>
          ${opts.cantidadModo === "otra" ? `<label><span>Cantidad de hojas a laminar</span><input type="number" min="1" max="${Math.max(1, ctx.totalSheets)}" step="1" value="${clampInt(opts.cantidadOtra, 1, 100000)}" data-opt="cantidadOtra"></label>` : ""}
        </div>`;
    }
    if (key === "abrochado") {
      return `
        <div class="service-options">
          <label><span>¿Dónde va el abrochado?</span><select data-opt="posicion">
            ${optionHtml("", "Elegí una opción…", !opts.posicion)}
            ${Object.keys(SERVICE_TEXTS.posicion).map((k) => {
              const base = SERVICE_TEXTS.posicion[k].replace(/^./, (c) => c.toUpperCase());
              const tooMany = k === "medio" && ctx.totalSheets > getMaxSheetsAcaballado();
              return optionHtml(k, tooMany ? `${base} — máx. ${getMaxSheetsAcaballado()} hojas` : base, opts.posicion === k);
            }).join("")}
          </select></label>
          ${ctx.totalSheets > getMaxSheetsAcaballado() ? `<p class="service-warning">El abrochado al medio (acaballado) se hace hasta ${getMaxSheetsAcaballado()} hojas. Con ${ctx.totalSheets} hojas elegí otra posición.</p>` : ""}
        </div>`;
    }
    if (key === "refilado") {
      return `
        <div class="service-options">
          <label><span>¿Tu archivo trae marcas de corte?</span><select data-opt="marcas">
            ${optionHtml("", "Elegí una opción…", !opts.marcas)}
            ${optionHtml("con_marcas", "Sí, trae marcas de corte", opts.marcas === "con_marcas")}
            ${optionHtml("sin_marcas", "No, refilar al ras del diseño", opts.marcas === "sin_marcas")}
          </select></label>
        </div>`;
    }
    if (key === "empanelado") {
      return `
        <div class="service-options">
          <label><span>Soporte</span><select data-opt="soporte">
            ${Object.keys(def.supports).map((k) => optionHtml(k, `${def.supports[k].label} (${currency.format(def.supports[k].pricePerM2)} el m²)`, opts.soporte === k)).join("")}
          </select></label>
          <label class="service-check"><input type="checkbox" data-opt="calado"${opts.calado ? " checked" : ""}><span>Va calado en el centro (carteles de recibida)</span></label>
        </div>`;
    }
    if (key === "troquelado") {
      const parts = [];
      if (def.fileNote) {
        const safeUrl = /^https:\/\//.test(def.helpUrl || "") ? def.helpUrl : "";
        parts.push(`<p class="service-file-note">📐 ${escapeHtml(def.fileNote)}${safeUrl ? ` <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener">Ver cómo preparar el archivo</a>` : ""}</p>`);
      }
      if (ctx.totalSheets >= def.discount.minSheets) {
        parts.push(`<label class="service-check"><input type="checkbox" data-opt="mismoDiseno"${opts.mismoDiseno ? " checked" : ""}><span>Las ${ctx.totalSheets} hojas son del mismo diseño de corte (${Math.round(def.discount.rate * 100)}% de descuento)</span></label>`);
      }
      if (ctx.totalSheets > def.daysOver.sheets) {
        parts.push(`<p class="service-warning">Con más de ${def.daysOver.sheets} hojas, la demora de este servicio es de ${formatLeadText(def.daysOver.days)}.</p>`);
      }
      return parts.length ? `<div class="service-options">${parts.join("")}</div>` : "";
    }
    return "";
  }

  function updateServicePrices() {
    const sv = getServicesState();
    const byKey = {};
    sv.list.forEach((entry) => { byKey[entry.key] = entry; });
    els.servicesList.querySelectorAll("[data-price-for]").forEach((node) => {
      const entry = byKey[node.dataset.priceFor];
      if (entry && !entry.error) {
        node.textContent = currency.format(entry.total);
        node.classList.add("is-final");
      } else {
        const def = servicesData.services[node.dataset.priceFor];
        node.textContent = def ? getServicePriceHint(node.dataset.priceFor) : "";
        node.classList.remove("is-final");
      }
    });
  }

  function renderServicesPanel(force) {
    if (!servicesData || !els.servicesPanel || !els.servicesList) {
      return;
    }
    const ctx = getServiceCtx();
    pruneServiceState(ctx);
    const available = getAvailableServiceKeys(ctx);
    els.servicesPanel.classList.toggle("hidden", available.length === 0);
    if (els.servicesBadge) {
      els.servicesBadge.textContent = `Trabajo ${state.savedItems.length + 1}`;
      els.servicesBadge.classList.toggle("hidden", state.savedItems.length === 0);
    }

    const selectedKeys = getSelectedServiceKeys();
    const signatureData = {
      available,
      selected: selectedKeys.map((k) => {
        const o = Object.assign({}, state.services.selected[k]);
        delete o.cantidadOtra;
        return [k, o];
      }),
      sheets: ctx.totalSheets,
      job: state.savedItems.length
    };
    const signature = JSON.stringify(signatureData);
    if (!force && signature === state.servicesSignature) {
      updateServicePrices();
      return;
    }
    state.servicesSignature = signature;

    const frag = document.createDocumentFragment();
    available.forEach((key) => {
      const def = servicesData.services[key];
      const checked = Boolean(state.services.selected[key]);
      const reason = checked ? "" : getServiceDisabledReason(key);
      const card = document.createElement("div");
      card.className = `service-card${checked ? " is-checked" : ""}${reason ? " is-disabled" : ""}`;
      card.innerHTML = `
        <label class="service-head">
          <input type="checkbox" data-service-check="${key}"${checked ? " checked" : ""}${reason ? " disabled" : ""}>
          <span class="service-name">${escapeHtml(def.label)}</span>
          <span class="service-price" data-price-for="${key}"></span>
        </label>
        ${reason ? `<p class="service-reason">${escapeHtml(reason)}</p>` : ""}
        ${getServiceInfo(key) ? `<p class="service-info">${escapeHtml(getServiceInfo(key))}</p>` : ""}
        ${checked ? buildServiceOptionsHtml(key, ctx, selectedKeys) : ""}
      `;
      frag.appendChild(card);
    });
    els.servicesList.innerHTML = "";
    els.servicesList.appendChild(frag);
    updateServicePrices();
  }

  function onServicesChanged() {
    renderServicesPanel(false);
    updateSummary();
  }

  function resetServicesForNextJob() {
    state.services.selected = {};
    state.servicesSignature = "";
    renderServicesPanel(true);
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
    const servicesSnapshot = getServicesState();

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
      services: servicesSnapshot.list.map((entry) => ({
        key: entry.key,
        label: entry.label,
        detail: entry.detail,
        quantity: entry.quantity,
        total: entry.total,
        priceRef: entry.priceRef
      })),
      pricing: {
        subtotal: totals.subtotal,
        discountRate: totals.discountRate,
        discountAmount: totals.discountAmount,
        servicesTotal: servicesSnapshot.total,
        total: totals.total + servicesSnapshot.total,
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
    const servicesTotal = orderItems.reduce((acc, item) => acc + (item.pricing.servicesTotal || 0), 0);
    const total = subtotal - discountAmount + servicesTotal;

    return {
      subtotal,
      servicesTotal,
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
    resetServicesForNextJob();
    updateSummary();
  }

  function escapeHtml(text) {
    return String(text === null || text === undefined ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderItemsPanel() {
    const count = state.savedItems.length;
    // Los trabajos agregados se ven siempre (cada uno con sus archivos); ya no hace falta el botón de mostrar/ocultar.
    els.toggleItemsBtn.classList.add("hidden");
    els.itemsPanel.classList.toggle("hidden", count === 0);
    updateUploadTitle();

    if (count === 0) {
      els.itemsList.innerHTML = "";
      return;
    }

    const frag = document.createDocumentFragment();
    state.savedItems.forEach((item, index) => {
      const entry = getJobEntry(item.id);
      const row = document.createElement("div");
      row.className = "item-row";
      const customSizeText = item.customSize
        ? ` · ${item.customSize.widthM.toFixed(2)}m x ${item.customSize.heightM.toFixed(2)}m`
        : "";
      let filesHtml;
      if (entry.files.length) {
        filesHtml = `<ul class="item-file-names">${entry.files.map((f) => `<li>📎 ${escapeHtml(f.name)} <span>(${formatBytes(f.size)})</span></li>`).join("")}</ul>`;
      } else if (entry.linkLater) {
        filesHtml = `<p class="item-file-warning is-mail">✉️ Vas a enviar el link por mail para este trabajo.</p>`;
      } else {
        filesHtml = `<p class="item-file-warning">⚠️ Este trabajo todavía no tiene archivo.</p>`;
      }
      row.innerHTML = `
        <div class="item-main">
          <strong><span class="item-badge">Trabajo ${index + 1}</span></strong>
          <p>${escapeHtml(item.machine.label)} · ${escapeHtml(item.paper.label)} · ${escapeHtml(item.size.label)}${customSizeText}${item.sides ? ` · ${escapeHtml(item.sides.label)}` : ""}</p>
          <small>${item.pricing.totalSheets} hojas · ${currency.format(item.pricing.total)}</small>
          ${(item.services || []).length ? `<ul class="item-service-list">${item.services.map((sv) => `<li>🔧 ${escapeHtml(sv.detail)} <span>(${currency.format(sv.total)})</span></li>`).join("")}</ul>` : ""}
          ${filesHtml}
          <label class="item-mail-link">
            <input type="checkbox" class="item-link-later" data-item-id="${item.id}"${entry.linkLater ? " checked" : ""}${entry.files.length ? " disabled" : ""}>
            <span>Enviaré el link de este trabajo por mail</span>
          </label>
        </div>
        <div class="item-actions">
          <button type="button" class="item-change-files" data-item-id="${item.id}">${entry.files.length ? "Cambiar archivos" : "Adjuntar archivos"}</button>
          <input type="file" class="item-file-input hidden" data-item-id="${item.id}" accept=".pdf,.jpg,.jpeg,.png,.ai,.psd,.cdr,.zip" multiple>
          <button type="button" class="item-remove" data-item-id="${item.id}">Quitar</button>
        </div>
      `;
      frag.appendChild(row);
    });
    els.itemsList.innerHTML = "";
    els.itemsList.appendChild(frag);
  }

  function updateSummary() {
    state.currentTotals = getCurrentQuote();

    renderServicesPanel(false);
    syncLeadDays();
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

    const currentServices = servicesData ? getServicesState().list.filter((entry) => !entry.error) : [];
    currentServices.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<span>${escapeHtml(entry.detail)}</span><strong>${currency.format(entry.total)}</strong>`;
      frag.appendChild(row);
    });

    const separator = document.createElement("div");
    separator.className = "summary-separator";
    separator.setAttribute("aria-hidden", "true");
    frag.appendChild(separator);

    const subtotalRow = document.createElement("div");
    subtotalRow.className = "row";
    subtotalRow.innerHTML = `<span>${aggregated.servicesTotal > 0 ? "Subtotal impresión" : "Subtotal"}</span><strong>${currency.format(aggregated.subtotal)}</strong>`;
    frag.appendChild(subtotalRow);

    if (aggregated.servicesTotal > 0) {
      const servicesRow = document.createElement("div");
      servicesRow.className = "row";
      servicesRow.innerHTML = `<span>Servicios adicionales</span><strong>${currency.format(aggregated.servicesTotal)}</strong>`;
      frag.appendChild(servicesRow);
    }

    if (aggregated.discountRate > 0) {
      const discountRow = document.createElement("div");
      discountRow.className = "row discount";
      discountRow.innerHTML = `<span>Descuento láser por cantidad (${Math.round(aggregated.discountRate * 100)}%)</span><strong>- ${currency.format(aggregated.discountAmount)}</strong>`;
      frag.appendChild(discountRow);
    }

    const totalRow = document.createElement("div");
    totalRow.className = "row total";
    totalRow.innerHTML = `<span>Total</span><strong>${currency.format(aggregated.total)}</strong>`;
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
    if (selected.value === "mercadopago") {
      return { key: "mercadopago", label: "Mercado Pago (pago online)" };
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

  async function uploadSingleFileInChunks(file, sessionId, fileIndex, totalFiles, progressState, uploadName) {
    const uploadId = `${sessionId}-file-${fileIndex + 1}`;
    const fileSize = file.size || 0;
    let uploadedBytesForFile = 0;

    await requestUploadAction({
      action: "upload_init",
      sessionId,
      uploadId,
      name: uploadName || file.name,
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
      name: result.file && result.file.name ? result.file.name : (uploadName || file.name),
      mimeType: result.file && result.file.mimeType ? result.file.mimeType : (file.type || "application/octet-stream"),
      sizeBytes: result.file && result.file.sizeBytes ? result.file.sizeBytes : (file.size || 0)
    };
  }

  // Sube los archivos de todos los trabajos. Si hay más de un trabajo, cada archivo
  // se guarda con el prefijo "Trabajo N - " para saber a qué trabajo pertenece.
  function buildUploadName(file, jobNumber, totalJobs) {
    return totalJobs > 1 ? `Trabajo ${jobNumber} - ${file.name}` : file.name;
  }

  async function uploadFilesForOrder(jobs, sessionId) {
    const entries = [];
    jobs.forEach((job, jobIndex) => {
      job.files.forEach((file) => {
        entries.push({ file, jobNumber: jobIndex + 1, uploadName: buildUploadName(file, jobIndex + 1, jobs.length) });
      });
    });

    if (!entries.length || !config.ordersWebhookUrl) {
      return entries.map((entry) => ({
        name: entry.uploadName,
        job: entry.jobNumber,
        mimeType: entry.file.type || "application/octet-stream",
        sizeBytes: entry.file.size || 0
      }));
    }

    const progressState = {
      totalBytes: entries.reduce((acc, entry) => acc + (entry.file.size || 0), 0),
      completedBytes: 0
    };
    updateUploadProgress(0, entries.length > 1 ? "Preparando archivos..." : "Preparando archivo...");
    const uploadedFiles = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const uploaded = await uploadSingleFileInChunks(entry.file, sessionId, index, entries.length, progressState, entry.uploadName);
      uploaded.job = entry.jobNumber;
      uploadedFiles.push(uploaded);
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
    if (els.paymentMpInfo) {
      els.paymentMpInfo.classList.toggle("hidden", method?.key !== "mercadopago");
    }
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

    const previousPickup = els.pickupDatetime.value;
    clearSelect(els.pickupDatetime);
    const requiresDate = state.leadDays > 0;
    if (requiresDate) {
      // Pedidos con servicios: no pueden ser urgentes, hay que elegir fecha de retiro.
      const placeholder = createOption("", "Elegí fecha y hora de retiro");
      placeholder.disabled = true;
      els.pickupDatetime.appendChild(placeholder);
    } else {
      els.pickupDatetime.appendChild(createOption("", "Sin fecha (trabajo urgente)"));
    }
    const pickupLabelText = document.getElementById("pickup-label-text");
    if (pickupLabelText) {
      pickupLabelText.textContent = requiresDate ? "Fecha y hora de retiro" : "Fecha y hora de retiro (opcional)";
    }
    const pickupDisclaimer = document.getElementById("pickup-disclaimer");
    if (pickupDisclaimer) {
      pickupDisclaimer.innerHTML = requiresDate
        ? "Los pedidos con servicios <strong>no pueden ser urgentes</strong>: el retiro se hace a partir de la fecha indicada arriba, según la demora de cada servicio."
        : "Si no se completa fecha/hora de retiro, se toma como <strong>trabajo urgente</strong>. La entrega según lo solicitado queda atada al caudal de trabajo.";
    }
    const earliest = getEarliestPickupDate(state.leadDays);

    const allowedDays = new Set((pickupSchedule.allowedWeekdays || []).map((d) => Number(d)));
    const slots = Array.isArray(pickupSchedule.slots) ? pickupSchedule.slots : [];
    const daysAhead = Math.max(1, Number(pickupSchedule.daysAhead || 21)) + state.leadDays * 2;
    const now = new Date();

    for (let offset = 0; offset <= daysAhead; offset += 1) {
      const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      const weekday = currentDate.getDay();
      if (!allowedDays.has(weekday)) {
        continue;
      }
      if (state.leadDays > 0 && currentDate.getTime() < earliest.getTime()) {
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

    if (previousPickup && Array.from(els.pickupDatetime.options).some((opt) => opt.value === previousPickup)) {
      els.pickupDatetime.value = previousPickup;
    } else {
      els.pickupDatetime.selectedIndex = 0;
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

    const currentWork = getCurrentWorkSnapshot();
    if (!currentWork && state.savedItems.length === 0) {
      setStatus("Agregá al menos un trabajo con cantidad de hojas mayor a 0.", "error");
      return false;
    }

    if (!currentWork && getSelectedFiles().length > 0) {
      setStatus(`Tenés archivos cargados para el Trabajo ${state.savedItems.length + 1}, pero sin cantidad de hojas. Cargá la cantidad y tocá "+ Agregar este trabajo", o quitá esos archivos.`, "error");
      return false;
    }

    if (servicesData) {
      const sv = getServicesState();
      if (sv.error) {
        setStatus(`${sv.error} (Trabajo ${state.savedItems.length + 1})`, "error");
        return false;
      }
    }

    if (state.leadDays > 0 && !els.pickupDatetime.value) {
      setStatus("Los pedidos con servicios no pueden ser urgentes: elegí la fecha y hora de retiro.", "error");
      els.pickupDatetime.focus();
      return false;
    }

    const jobs = collectJobs();
    const manyJobs = jobs.length > 1;
    for (let i = 0; i < jobs.length; i += 1) {
      const job = jobs[i];
      const who = manyJobs ? `del Trabajo ${i + 1}` : "de tu trabajo";
      const oversized = getOversizedFile(job.files);
      if (oversized) {
        setStatus(`El archivo ${oversized.name} (${manyJobs ? `Trabajo ${i + 1}` : "tu trabajo"}) supera el máximo recomendado de 20 MB. Completá el pedido sin adjuntarlo, marcá la opción de enviar el link por mail y después mandá el link de Drive o WeTransfer a pedidos@29bis.com.ar con tu número de pedido.`, "error");
        return false;
      }
      if (!job.files.length && !job.linkLater) {
        setStatus(`Falta el archivo ${who}. Adjuntalo o marcá la opción de enviar el link por mail.`, "error");
        return false;
      }
    }

    return true;
  }

  async function buildOrderPayload(orderItems, uploadedFiles, uploadSessionId, jobs) {
    const urgent = !els.pickupDatetime.value;
    const pricingTotals = getAggregatedPricing(orderItems);
    const paymentMethod = getSelectedPaymentMethod();
    const firstFileName = uploadedFiles[0] ? uploadedFiles[0].name : null;
    const jobList = jobs || [];
    const externalFilesByEmail = jobList.some((job) => job.linkLater);
    let notesText = els.notes.value.trim();
    if (externalFilesByEmail && jobList.length > 1) {
      const mailJobs = jobList.map((job, i) => (job.linkLater ? i + 1 : 0)).filter(Boolean);
      const aviso = `[Archivos por mail: Trabajo ${mailJobs.join(", ")}]`;
      notesText = notesText ? `${aviso} ${notesText}` : aviso;
    }

    // El detalle de servicios ya viaja en cada trabajo (orderItems[].services) y se ve
    // en la columna "Servicios" de la planilla: no se mezcla con las observaciones del cliente.

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
      notes: notesText,
      fileName: firstFileName,
      fileNames: uploadedFiles.map((file) => file.name),
      uploadedFiles,
      pricing: {
        subtotal: pricingTotals.subtotal + pricingTotals.servicesTotal,
        servicesTotal: pricingTotals.servicesTotal,
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
      mailError: data.mailError || "",
      paymentUrl: data.paymentUrl || "",
      paymentToken: data.paymentToken || ""
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
      paymentUrl: result && result.paymentUrl ? result.paymentUrl : "",
      paymentToken: result && result.paymentToken ? result.paymentToken : "",
      pickupLabel,
      filesSummary: externalFilesByEmail
        ? (fileNames.length
          ? `${summarizeFileNamesForConfirmation(fileNames)} · el resto se envía por mail (Drive o WeTransfer)`
          : "Se enviarán por mail (Drive o WeTransfer)")
        : summarizeFileNamesForConfirmation(fileNames),
      externalFilesByEmail,
      mailSent: Boolean(result && result.mailSent),
      mailError: result && result.mailError ? result.mailError : ""
    };
  }

  function openOrderConfirmationPage(confirmationData) {
    const storageKey = `order-confirmation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(storageKey, JSON.stringify(confirmationData));
    const confirmationUrl = `./confirmacion.html?id=${encodeURIComponent(storageKey)}`;
    window.location.href = confirmationUrl;
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

      const servicesCheck = servicesData ? getServicesState() : { error: "" };
      if (servicesCheck.error) {
        setStatus(servicesCheck.error, "error");
        return;
      }
      const files = getSelectedFiles();
      const linkLater = Boolean(els.sendLinkLater && els.sendLinkLater.checked) && !files.length;
      const jobNumber = state.savedItems.length + 1;
      const oversized = getOversizedFile(files);
      if (oversized) {
        setStatus(`El archivo ${oversized.name} supera el máximo recomendado de 20 MB. Quitalo y marcá la opción de enviar el link por mail para este trabajo.`, "error");
        return;
      }
      if (!files.length && !linkLater) {
        setStatus(`Antes de agregar el Trabajo ${jobNumber}, adjuntá su archivo en el recuadro rosa de arriba o marcá la opción de enviar el link por mail.`, "error");
        return;
      }

      state.jobFiles.set(currentWork.id, { files, linkLater });
      state.savedItems.push(currentWork);
      state.showItemsPanel = true;
      // El espacio de archivos queda vacío para el próximo trabajo.
      els.fileInput.value = "";
      if (els.sendLinkLater) {
        els.sendLinkLater.checked = false;
      }
      renderItemsPanel();
      updateSummary();
      clearWorkInputsForNextItem();
      updateFileMeta();
      setStatus(`Trabajo ${jobNumber} agregado con sus archivos. Ahora cargá el Trabajo ${jobNumber + 1} y sus archivos.`, "ok");
    });

    els.toggleItemsBtn.addEventListener("click", () => {
      state.showItemsPanel = !state.showItemsPanel;
      renderItemsPanel();
    });

    els.itemsList.addEventListener("click", (event) => {
      const changeBtn = event.target.closest(".item-change-files");
      if (changeBtn) {
        const input = Array.from(els.itemsList.querySelectorAll(".item-file-input"))
          .find((el) => el.dataset.itemId === changeBtn.dataset.itemId);
        if (input) {
          input.click();
        }
        return;
      }
      const button = event.target.closest(".item-remove");
      if (!button) {
        return;
      }
      const itemId = button.dataset.itemId;
      state.jobFiles.delete(itemId);
      state.savedItems = state.savedItems.filter((item) => item.id !== itemId);
      state.servicesSignature = "";
      if (state.savedItems.length === 0) {
        state.showItemsPanel = false;
      }
      renderItemsPanel();
      updateSummary();
    });

    if (els.servicesList) {
      els.servicesList.addEventListener("change", (event) => {
        const target = event.target;
        if (!target || !target.dataset) {
          return;
        }
        if (target.dataset.serviceCheck) {
          const key = target.dataset.serviceCheck;
          if (target.checked) {
            state.services.selected[key] = serviceDefaultOptions(key);
          } else {
            delete state.services.selected[key];
          }
          setStatus("");
          onServicesChanged();
          return;
        }
        if (target.dataset.opt) {
          const card = target.closest(".service-card");
          const checkEl = card ? card.querySelector("[data-service-check]") : null;
          const key = checkEl ? checkEl.dataset.serviceCheck : "";
          if (!key || !state.services.selected[key]) {
            return;
          }
          if (target.dataset.opt === "cantidadOtra") {
            const maxSheets = Math.max(1, getQuantityTotal());
            target.value = String(clampInt(target.value, 1, maxSheets));
          }
          state.services.selected[key][target.dataset.opt] = target.type === "checkbox" ? target.checked : target.value;
          onServicesChanged();
        }
      });
      els.servicesList.addEventListener("input", (event) => {
        const target = event.target;
        if (!target || !target.dataset || target.dataset.opt !== "cantidadOtra") {
          return;
        }
        const card = target.closest(".service-card");
        const checkEl = card ? card.querySelector("[data-service-check]") : null;
        const key = checkEl ? checkEl.dataset.serviceCheck : "";
        if (!key || !state.services.selected[key]) {
          return;
        }
        state.services.selected[key].cantidadOtra = target.value;
        updateServicePrices();
        updateSummary();
      });
    }

    els.itemsList.addEventListener("change", (event) => {
      const target = event.target;
      if (!target) {
        return;
      }
      const itemId = target.dataset ? target.dataset.itemId : "";
      if (!itemId) {
        return;
      }
      if (target.classList.contains("item-file-input")) {
        const files = Array.from(target.files || []);
        if (!files.length) {
          return;
        }
        const oversized = getOversizedFile(files);
        if (oversized) {
          setStatus(`El archivo ${oversized.name} supera el máximo recomendado de 20 MB. Elegí otro o marcá la opción de enviar el link por mail para este trabajo.`, "error");
          return;
        }
        state.jobFiles.set(itemId, { files, linkLater: false });
        setStatus("");
      } else if (target.classList.contains("item-link-later")) {
        const entry = getJobEntry(itemId);
        state.jobFiles.set(itemId, { files: entry.files, linkLater: target.checked && !entry.files.length });
      } else {
        return;
      }
      renderItemsPanel();
      updateProgressSteps();
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

        const jobs = collectJobs();
        const orderItems = jobs.map((job) => ({
          ...job.item,
          fileNames: job.files.map((file) => buildUploadName(file, jobs.indexOf(job) + 1, jobs.length)),
          filesByEmail: job.linkLater
        }));

        const submitBtn = document.getElementById("submit-order-btn") || els.form.querySelector("button[type='submit']");
        submitBtn.disabled = true;
        submitBtn.textContent = "Enviando...";

        const uploadSessionId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const uploadedFiles = await uploadFilesForOrder(jobs, uploadSessionId);
        setStatus("Enviando pedido...", "loading");
        updateUploadProgress(100, "Preparando pedido...");
        const payload = await buildOrderPayload(orderItems, uploadedFiles, uploadSessionId, jobs);

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
        state.jobFiles.clear();
        state.services.selected = {};
        state.servicesSignature = "";
        state.leadDays = 0;
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
    if (config.mercadoPagoEnabled === false) {
      const mpOption = document.getElementById("payment-mp-option");
      if (mpOption) {
        mpOption.remove();
      }
    }
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
