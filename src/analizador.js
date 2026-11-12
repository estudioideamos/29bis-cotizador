// Lector de PDF del cotizador: lee tamaño y cobertura de cada página en la computadora del cliente,
// separa el archivo por tamaño (un trabajo por tamaño) y completa el cotizador solo.
// Si el archivo pesa más de 20 MB, lo aplana (lo convierte en imágenes) antes de subirlo.
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const CFG = Object.assign({
  lineasHasta: 15,      // % de cobertura
  mixtoHasta: 50,
  umbralTinta: 230,     // "normal": un píxel cuenta como tinta si algún canal baja de esto
  maxBytes: 20 * 1024 * 1024,
  aplanadoDpi: 300,
  aplanadoCalidad: 0.85
}, (window.APP_CONFIG && window.APP_CONFIG.lectorPdf) || {});

const LASER_SIZES = [["A4", 210, 297], ["A3", 297, 420], ["A3", 320, 450]]; // SA3 se trata como A3
const PLOTTER_SIZES = [["A2", 420, 594], ["A1", 594, 841], ["A0", 841, 1189], ["35x50", 350, 500], ["50x70", 500, 700], ["70x100", 700, 1000]];
const MM = 25.4 / 72;
const BAND_LBL = { lineas: "líneas", mixto: "mixto", pleno: "pleno" };

const $ = (id) => document.getElementById(id);
const api = () => window.COTIZADOR_API;
const st = { file: null, groups: [], current: -1, copies: 1, extra: [], busy: false, numPages: 0 };

// Tamaños para "Imprimir en otro tamaño": [máquina, código, nombre]
const ALL_SIZES = [["laser", "A4", "A4"], ["laser", "A3", "A3"], ["plotter", "A2", "A2"], ["plotter", "A1", "A1"], ["plotter", "A0", "A0"],
  ["plotter", "35x50", "35 x 50 cm"], ["plotter", "50x70", "50 x 70 cm"], ["plotter", "70x100", "70 x 100 cm"]];

function setMode(mode) {
  document.body.classList.remove("modo-espera", "modo-lector", "modo-manual");
  document.body.classList.add("modo-" + mode);
}

// copias de una página (número de página del archivo original)
function copiesOf(n) {
  const ex = st.extra.filter((x) => Number(x.page) === n && Number(x.copies) > 0).pop();
  return ex ? Math.round(Number(ex.copies)) : st.copies;
}

function copiesNote() {
  const parts = [];
  if (st.copies > 1) parts.push(`${st.copies} copias de todo el archivo`);
  st.extra.filter((x) => Number(x.page) >= 1 && Number(x.copies) > 0).forEach((x) => parts.push(`${x.copies} ${Number(x.copies) === 1 ? "copia" : "copias"} de la pág. ${x.page}`));
  return parts.length ? "Copias: " + parts.join(", ") : "";
}

function pagesFor(g) {
  return g.pages.map((p) => ({ band: p.band, copies: copiesOf(p.n) }));
}

const kb = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.round(b / 1024) + " KB");
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function classify(wMm, hMm) {
  const a = Math.min(wMm, hMm), b = Math.max(wMm, hMm);
  for (const [key, w, h] of LASER_SIZES) if (Math.abs(a - w) <= 6 && Math.abs(b - h) <= 6) return { machine: "laser", sizeKey: key };
  for (const [key, w, h] of PLOTTER_SIZES) if (Math.abs(a - w) <= 6 && Math.abs(b - h) <= 6) return { machine: "plotter", sizeKey: key };
  // tamaño libre: plotter personalizado (en metros, redondeado al cm)
  const w = Math.round(a / 10) / 100, h = Math.round(b / 10) / 100;
  return { machine: "plotter", sizeKey: `${w}x${h}`, custom: { w, h } };
}

function band(pct) {
  return pct <= CFG.lineasHasta ? "lineas" : pct <= CFG.mixtoHasta ? "mixto" : "pleno";
}

async function renderToCanvas(page, scale) {
  const vp = page.getViewport({ scale });
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(vp.width));
  c.height = Math.max(1, Math.round(vp.height));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvas: c, canvasContext: ctx, viewport: vp }).promise;
  return { c, ctx };
}

async function analyzePage(page) {
  const vp1 = page.getViewport({ scale: 1 });
  const { c, ctx } = await renderToCanvas(page, 1200 / Math.max(vp1.width, vp1.height));
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < CFG.umbralTinta || data[i + 1] < CFG.umbralTinta || data[i + 2] < CFG.umbralTinta) ink += 1;
  }
  const pct = (100 * ink) / (c.width * c.height);
  const thumb = document.createElement("canvas");
  thumb.width = 56;
  thumb.height = Math.max(1, Math.round((56 * c.height) / c.width));
  thumb.getContext("2d").drawImage(c, 0, 0, thumb.width, thumb.height);
  c.width = c.height = 0;
  return Object.assign({ pct, band: band(pct), thumb: thumb.toDataURL("image/jpeg", 0.6) }, classify(vp1.width * MM, vp1.height * MM));
}

// PDF nuevo con solo esas páginas: copiando el original (liviano) o aplanando a imagen (pesado)
async function buildFile(pdf, srcBytes, pageNums, name, flatten, onProgress) {
  const out = await PDFLib.PDFDocument.create();
  if (!flatten) {
    const src = await PDFLib.PDFDocument.load(srcBytes, { ignoreEncryption: true });
    const pages = await out.copyPages(src, pageNums.map((n) => n - 1));
    pages.forEach((p) => out.addPage(p));
  } else {
    for (let k = 0; k < pageNums.length; k++) {
      onProgress(k + 1, pageNums.length);
      const page = await pdf.getPage(pageNums[k]);
      const vp1 = page.getViewport({ scale: 1 });
      let scale = CFG.aplanadoDpi / 72;
      const maxPx = 64e6; // tope para que el navegador no se quede sin memoria
      if (vp1.width * scale * vp1.height * scale > maxPx) scale = Math.sqrt(maxPx / (vp1.width * vp1.height));
      const { c } = await renderToCanvas(page, scale);
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", CFG.aplanadoCalidad));
      const img = await out.embedJpg(await blob.arrayBuffer());
      out.addPage([vp1.width, vp1.height]).drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
      c.width = c.height = 0;
      page.cleanup();
    }
  }
  const bytes = await out.save();
  return new File([bytes], name, { type: "application/pdf" });
}

function setMsg(html, kind) {
  const el = $("lector-msg");
  el.innerHTML = html;
  el.className = "lector-msg" + (kind ? " is-" + kind : "");
}

function groupLabel(g) {
  const size = g.custom ? `${g.custom.w.toFixed(2).replace(".", ",")} x ${g.custom.h.toFixed(2).replace(".", ",")} m` : (g.sizeKey === "A3" ? "A3" : (api() ? api().sizeLabel(g.sizeKey) : g.sizeKey));
  return `${g.pages.length} ${g.pages.length === 1 ? "página" : "páginas"} ${size} · ${g.machine === "laser" ? "láser" : "plotter"}`;
}

function bandText(g) {
  const n = { lineas: 0, mixto: 0, pleno: 0 };
  g.pages.forEach((p) => { n[p.band] += 1; });
  return Object.entries(n).filter(([, v]) => v).map(([k, v]) => `${v} ${BAND_LBL[k]}`).join(" · ");
}

function renderGroups() {
  const box = $("lector-result");
  if (!st.groups.length) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  const multi = st.groups.length > 1;
  $("lector-groups").innerHTML = st.groups.map((g, i) => {
    const estado = i < st.current ? "Agregado ✓" : i === st.current ? "Cargado abajo" : "Pendiente";
    const cls = i < st.current ? "done" : i === st.current ? "now" : "next";
    return `<div class="lector-group is-${cls}">
      <div class="lector-thumbs">${g.pages.slice(0, 6).map((p) => `<img src="${p.thumb}" alt="">`).join("")}${g.pages.length > 6 ? `<span>+${g.pages.length - 6}</span>` : ""}</div>
      <div class="lector-gtext">${multi ? `<b>Trabajo ${i + 1}:</b> ` : ""}${esc(groupLabel(g))}<br><small>Cobertura: ${bandText(g)}${g.note ? " · " + esc(g.note) : ""}</small></div>
      ${multi ? `<span class="lector-badge">${estado}</span>` : ""}
    </div>`;
  }).join("");
  const pend = st.groups.length - 1 - st.current;
  $("lector-next").textContent = multi && pend > 0
    ? `Tu archivo tiene ${st.groups.length} tamaños distintos, así que lo separamos en ${st.groups.length} trabajos. Elegí abajo el papel y la faz del Trabajo ${st.current + 1}, tocá “+ Agregar este trabajo” y cargamos el siguiente solo.`
    : multi ? "Este es el último trabajo del archivo. Elegí el papel y la faz, y seguí con tus datos." : "Elegí abajo el papel y la faz. La cantidad de hojas y la cobertura ya están cargadas: si algo no coincide, podés corregirlo.";
}

function loadGroup(i) {
  st.current = i;
  const g = st.groups[i];
  if (!g || !api()) return;
  const o = g.override;
  api().loadJob({
    machine: o ? o.machine : g.machine,
    sizeKey: o ? o.sizeKey : g.sizeKey,
    custom: o ? null : (g.custom || null),
    pages: pagesFor(g),
    nota: copiesNote(),
    files: g.file ? [g.file] : [],
    linkLater: !g.file
  });
  setMode("lector");
  renderGroups();
  renderSize();
  $("lector-config").scrollIntoView({ behavior: "smooth", block: "start" });
}

function sizeText(g) {
  if (g.override) return ALL_SIZES.find((x) => x[0] === g.override.machine && x[1] === g.override.sizeKey)[2];
  return g.custom ? `${g.custom.w.toFixed(2).replace(".", ",")} x ${g.custom.h.toFixed(2).replace(".", ",")} m` : g.sizeKey;
}

function renderSize() {
  const g = st.groups[st.current];
  if (!g) return;
  $("lector-size").innerHTML = `<b>${esc(sizeText(g))}</b> · ${(g.override ? g.override.machine : g.machine) === "laser" ? "impresión láser" : "plotter"}` +
    (g.override ? ` <span class="muted">(tu archivo es ${esc(g.custom ? "de tamaño libre" : g.sizeKey)})</span>` : ` <span class="muted">(detectado en tu archivo)</span>`);
  $("lector-size-other").textContent = g.override ? "Volver al tamaño del archivo" : "Imprimir en otro tamaño";
  $("lector-size-pick").classList.add("hidden");
}

function renderSheets(detail) {
  const info = api() && api().sheetsInfo();
  if (!info) { $("lector-sheets").textContent = ""; return; }
  const total = info.sheets.reduce((a, s) => a + s.copies, 0);
  const n = { lineas: 0, mixto: 0, pleno: 0 };
  info.sheets.forEach((s) => { n[s.band] += s.copies; });
  const cob = Object.entries(n).filter(([, v]) => v).map(([k, v]) => `${v} ${BAND_LBL[k]}`).join(" · ");
  $("lector-sheets").innerHTML = `Vas a imprimir <b>${total} ${total === 1 ? "hoja" : "hojas"}</b>` + (info.coverage ? ` (${cob})` : "") + ".";
}

function renderExtra() {
  $("lector-extra").innerHTML = st.extra.map((x, i) => `<div class="lector-extra-row" data-i="${i}">
      <input type="number" min="1" step="1" value="${esc(x.copies)}" data-k="copies" aria-label="Copias"> <span>copias de la página</span>
      <input type="number" min="1" max="${st.numPages}" step="1" value="${esc(x.page)}" data-k="page" aria-label="Página">
      <button type="button" class="lector-x" data-del="${i}" aria-label="Quitar">×</button></div>`).join("");
}

function copiesChanged() {
  if (!api() || st.current < 0 || st.current >= st.groups.length) return;
  api().setPages(pagesFor(st.groups[st.current]), copiesNote());
}

async function handleFile(file) {
  if (st.busy || !file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    setMsg("El lector funciona con archivos <b>PDF</b>. Para otros formatos, cargá el trabajo a mano más abajo.", "error");
    return;
  }
  if (!api()) { setMsg("El cotizador todavía se está cargando. Probá de nuevo en unos segundos.", "error"); return; }
  st.busy = true; st.file = file; st.groups = []; st.current = -1; st.extra = []; st.copies = 1;
  $("lector-copies").value = "1"; renderExtra();
  renderGroups();
  $("lector-drop").classList.add("is-busy");
  try {
    setMsg("Abriendo el archivo…");
    const srcBytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: srcBytes.slice() }).promise;
    const pages = [];
    st.numPages = pdf.numPages;
    for (let n = 1; n <= pdf.numPages; n++) {
      setMsg(`Leyendo página ${n} de ${pdf.numPages}…`);
      const page = await pdf.getPage(n);
      pages.push(Object.assign({ n }, await analyzePage(page)));
      page.cleanup();
    }
    // agrupar por tamaño, respetando el orden en que aparecen
    const groups = [];
    pages.forEach((p) => {
      let g = groups.find((x) => x.machine === p.machine && x.sizeKey === p.sizeKey);
      if (!g) { g = { machine: p.machine, sizeKey: p.sizeKey, custom: p.custom, pages: [] }; groups.push(g); }
      g.pages.push(p);
    });
    const heavy = file.size > CFG.maxBytes;
    const base = file.name.replace(/\.pdf$/i, "");
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const nums = g.pages.map((p) => p.n);
      if (groups.length === 1 && !heavy) { g.file = file; continue; }
      const name = groups.length > 1 ? `${base} - ${g.custom ? "personalizado" : g.sizeKey}.pdf` : `${base}.pdf`;
      try {
        g.file = await buildFile(pdf, srcBytes, nums, name, heavy, (k, t) => setMsg(`Achicando el archivo${groups.length > 1 ? ` (trabajo ${i + 1})` : ""}: página ${k} de ${t}…`));
      } catch (err) {
        // si no se pudo separar sin aplanar (PDF raro), se aplana
        g.file = heavy ? null : await buildFile(pdf, srcBytes, nums, name, true, (k, t) => setMsg(`Preparando el archivo: página ${k} de ${t}…`));
      }
      if (g.file && g.file.size > CFG.maxBytes) {
        g.file = null;
        g.note = "pesa demasiado aun achicado: mandalo por Drive o WeTransfer";
      }
    }
    st.groups = groups;
    const total = pages.length;
    const anyLink = groups.some((g) => !g.file);
    setMsg(`Listo: <b>${esc(file.name)}</b> · ${total} ${total === 1 ? "página" : "páginas"} · ${kb(file.size)}` +
      (heavy && !anyLink ? ` → lo achicamos para que se suba rápido (${kb(groups.reduce((s, g) => s + g.file.size, 0))}).` : "") +
      (anyLink ? " · <b>Algún archivo sigue siendo muy pesado:</b> completá el pedido y mandalo por Drive o WeTransfer a pedidos@29bis.com.ar." : ""), anyLink ? "warn" : "ok");
    loadGroup(0);
  } catch (err) {
    console.error(err);
    setMsg("No pudimos leer este PDF. Cargá el trabajo a mano más abajo (podés adjuntar el archivo igual).", "error");
  } finally {
    st.busy = false;
    $("lector-drop").classList.remove("is-busy");
  }
}

function bind() {
  const drop = $("lector-drop"), input = $("lector-input");
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => { handleFile(input.files[0]); input.value = ""; });
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("is-over"); handleFile(e.dataTransfer.files[0]); });
  $("lector-copies").addEventListener("input", () => {
    st.copies = Math.max(1, Math.round(Number($("lector-copies").value) || 1));
    copiesChanged();
  });
  $("lector-add-extra").addEventListener("click", () => {
    st.extra.push({ copies: 2, page: 1 });
    renderExtra(); copiesChanged();
  });
  $("lector-extra").addEventListener("input", (e) => {
    const row = e.target.closest(".lector-extra-row"); if (!row) return;
    st.extra[Number(row.dataset.i)][e.target.dataset.k] = Math.max(1, Math.round(Number(e.target.value) || 1));
    copiesChanged();
  });
  $("lector-extra").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]"); if (!b) return;
    st.extra.splice(Number(b.dataset.del), 1); renderExtra(); copiesChanged();
  });
  $("lector-size-other").addEventListener("click", () => {
    const g = st.groups[st.current]; if (!g) return;
    if (g.override) { g.override = null; loadGroup(st.current); return; }
    const pick = $("lector-size-pick");
    pick.innerHTML = ALL_SIZES.map(([m, k, l]) => `<button type="button" data-m="${m}" data-k="${k}">${l}</button>`).join("");
    pick.classList.toggle("hidden");
  });
  $("lector-size-pick").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-k]"); const g = st.groups[st.current]; if (!b || !g) return;
    g.override = (b.dataset.k === g.sizeKey && b.dataset.m === g.machine) ? null : { machine: b.dataset.m, sizeKey: b.dataset.k };
    loadGroup(st.current);
  });
  document.querySelectorAll("[data-manual]").forEach((b) => b.addEventListener("click", () => {
    if (api()) api().clear();
    setMode("manual");
    document.getElementById("quote-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  document.addEventListener("cotizador:analisis-aplicado", renderSheets);
  document.addEventListener("cotizador:trabajo-agregado", () => {
    if (st.current >= 0 && st.current < st.groups.length - 1) {
      loadGroup(st.current + 1);
    } else if (st.current >= 0) {
      st.current = st.groups.length; // todos agregados
      renderGroups();
      $("lector-next").textContent = "Listo: agregaste todos los trabajos del archivo. Podés subir otro PDF o seguir con tus datos.";
    }
  });
}

setMode("espera");
bind();
