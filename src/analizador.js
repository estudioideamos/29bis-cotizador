// Lector de PDF del cotizador: lee tamaño y cobertura de cada página en la computadora del cliente,
// separa el archivo por tamaño (un trabajo por tamaño) y completa el cotizador solo.
// Si el archivo pesa más de 20 MB, lo aplana (lo convierte en imágenes a 300 dpi) antes de subirlo.
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const CFG = Object.assign({
  lineasHasta: 15,      // % de cobertura
  mixtoHasta: 50,
  umbralTinta: 230,     // "normal": un píxel cuenta como tinta si algún canal baja de esto
  maxBytes: 20 * 1024 * 1024,
  lentoSegundos: 8,     // tiempo de lectura a partir del cual el archivo se considera "difícil"
  aplanarSiEsLento: false, // true = también se aplanan los archivos difíciles aunque pesen menos del límite
  aplanadoDpi: 300,     // se respeta siempre: la página se dibuja en franjas para no pasarse de memoria
  aplanadoCalidades: [0.92, 0.85, 0.75] // se prueba de mayor a menor hasta que el archivo entre en el límite
}, (window.APP_CONFIG && window.APP_CONFIG.lectorPdf) || {});

// SA3 = 32 x 47 cm (también se acepta 32 x 45): solo papeles especiales
const LASER_SIZES = [["A4", 210, 297], ["A3", 297, 420], ["SA3", 320, 450], ["SA3", 320, 470]];
const PLOTTER_SIZES = [["A2", 420, 594], ["A1", 594, 841], ["A0", 841, 1189], ["35x50", 350, 500], ["50x70", 500, 700], ["70x100", 700, 1000]];
const MM = 25.4 / 72;
const BAND_LBL = { lineas: "líneas", mixto: "mixto", pleno: "pleno" };

const $ = (id) => document.getElementById(id);
const api = () => window.COTIZADOR_API;
const st = { file: null, groups: [], current: -1, copies: 1, extra: [], busy: false, numPages: 0, offset: 0 };
// número de trabajo dentro del pedido (sigue la cuenta de los que ya estaban agregados)
const jobNum = (i) => st.offset + i + 1;

// Tamaños para "Imprimir en otro tamaño": [máquina, código, nombre]
const ALL_SIZES = [["laser", "A4", "A4"], ["laser", "A3", "A3"], ["laser", "SA3", "SA3 (32 x 47 cm)"], ["plotter", "A2", "A2"], ["plotter", "A1", "A1"], ["plotter", "A0", "A0"],
  ["plotter", "35x50", "35 x 50 cm"], ["plotter", "50x70", "50 x 70 cm"], ["plotter", "70x100", "70 x 100 cm"]];

function setMode(mode) {
  document.body.classList.remove("modo-espera", "modo-lector", "modo-manual", "modo-listo");
  document.body.classList.add("modo-" + mode);
}

// copias de una página (número de página del archivo original)
function copiesOf(n) {
  const ex = st.extra.filter((x) => Number(x.page) === n && Number(x.copies) > 0).pop();
  return ex ? Math.round(Number(ex.copies)) : st.copies;
}

// Si el cliente eligió otro tamaño, el taller tiene que saberlo
function ajusteNote(g) {
  if (!g.override) return "";
  const orig = g.custom ? `${g.custom.w.toFixed(2).replace(".", ",")} x ${g.custom.h.toFixed(2).replace(".", ",")} m` : g.sizeKey;
  const dest = ALL_SIZES.find((x) => x[0] === g.override.machine && x[1] === g.override.sizeKey)[2];
  return `AJUSTAR TAMAÑO: el archivo es ${orig} y se imprime en ${dest}`;
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
  // tamaño libre: si entra en una hoja de láser (hasta SA3), va a láser en la hoja que le alcanza
  if (a <= 210 + 3 && b <= 297 + 3) return { machine: "laser", sizeKey: "A4" };
  if (a <= 297 + 3 && b <= 420 + 3) return { machine: "laser", sizeKey: "A3" };
  if (a <= 320 + 3 && b <= 470 + 3) return { machine: "laser", sizeKey: "SA3" };
  // si no, plotter personalizado (en metros, redondeado al cm, con el mínimo del plotter)
  const minM = (window.APP_CONFIG && window.APP_CONFIG.customSizeLimits && Number(window.APP_CONFIG.customSizeLimits.minM)) || 0.3;
  const w = Math.max(minM, Math.round(a / 10) / 100), h = Math.max(minM, Math.round(b / 10) / 100);
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
async function buildFile(pdf, srcBytes, pageNums, name, flatten, onProgress, calidad) {
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
      const scale = CFG.aplanadoDpi / 72;
      const vp = page.getViewport({ scale });
      const W = Math.max(1, Math.round(vp.width));
      const H = Math.max(1, Math.round(vp.height));
      // La página se dibuja en franjas horizontales para mantener los 300 dpi en cualquier tamaño
      // sin pasarse de memoria (iPhone/iPad no permiten imágenes de más de ~16 millones de píxeles).
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const maxPx = ios ? 12e6 : 32e6;
      const stripH = Math.max(256, Math.min(H, Math.floor(maxPx / W)));
      const outPage = out.addPage([vp1.width, vp1.height]);
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d");
      for (let y0 = 0; y0 < H; y0 += stripH) {
        const h = Math.min(stripH, H - y0);
        c.width = W;
        c.height = h;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, W, h);
        await page.render({ canvas: c, canvasContext: ctx, viewport: vp, transform: [1, 0, 0, 1, 0, -y0] }).promise;
        const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", calidad || CFG.aplanadoCalidades[0]));
        const img = await out.embedJpg(await blob.arrayBuffer());
        const pt = vp1.height / H; // puntos por píxel
        outPage.drawImage(img, { x: 0, y: vp1.height - (y0 + h) * pt, width: vp1.width, height: h * pt });
      }
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
      <div class="lector-gtext">${multi || st.offset ? `<b>Trabajo ${jobNum(i)}:</b> ` : ""}${esc(groupLabel(g))}<br><small>Cobertura: ${bandText(g)}${g.note ? " · " + esc(g.note) : ""}</small></div>
      ${multi ? `<span class="lector-badge">${estado}</span>` : ""}
    </div>`;
  }).join("");
  $("lector-config").classList.toggle("hidden", st.current < 0 || st.current >= st.groups.length);
  const pend = st.groups.length - 1 - st.current;
  $("lector-next").textContent = multi && pend > 0
    ? `Tu archivo tiene ${st.groups.length} tamaños distintos, así que lo separamos en ${st.groups.length} trabajos. Elegí abajo el papel y la faz del Trabajo ${jobNum(st.current)}, tocá “+ Agregar este trabajo” y cargamos el siguiente solo.`
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
    nota: [copiesNote(), ajusteNote(g), g.aplanado ? "ARCHIVO APLANADO POR LA WEB (300 dpi): revisar líneas finas" : ""].filter(Boolean).join(" · "),
    ajustarTamano: Boolean(o),
    files: g.file ? [g.file] : [],
    linkLater: !g.file
  });
  setMode("lector");
  renderGroups();
  renderSize();
  // aviso del paso que sigue (en rosa, entre la carga del archivo y la caja de configuración)
  const multi = st.groups.length > 1;
  $("lector-paso").innerHTML = i === 0
    ? `✓ Archivo cargado. ${multi ? `Lo separamos en ${st.groups.length} trabajos: elegí` : "Elegí"} el papel y la faz acá abajo ↓`
    : `✓ Trabajo agregado. Ahora elegí el papel y la faz del Trabajo ${jobNum(i)} ↓`;
  $("lector-paso").classList.remove("hidden");
  // la página se queda donde está; solo si venía de agregar un trabajo (abajo de todo) sube al aviso
  if (i > 0) $("lector-paso").scrollIntoView({ behavior: "smooth", block: "start" });
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
  api().setPages(pagesFor(st.groups[st.current]), [copiesNote(), ajusteNote(st.groups[st.current])].filter(Boolean).join(" · "));
}

async function handleFile(file) {
  if (st.busy || !file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    setMsg("El lector funciona con archivos <b>PDF</b>. Para otros formatos, cargá el trabajo a mano más abajo.", "error");
    return;
  }
  if (!api()) { setMsg("El cotizador todavía se está cargando. Probá de nuevo en unos segundos.", "error"); return; }
  st.busy = true; st.file = file; st.groups = []; st.current = -1; st.extra = []; st.copies = 1;
  st.offset = api().jobCount();
  $("lector-paso").classList.add("hidden");
  $("lector-copies").value = "1"; renderExtra();
  renderGroups();
  $("lector-drop").classList.add("is-busy");
  try {
    setMsg("Abriendo el archivo…");
    const t0 = performance.now();
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
    const segundos = (performance.now() - t0) / 1000;
    const heavy = file.size > CFG.maxBytes;
    const slow = segundos > CFG.lentoSegundos; // archivo "difícil": muchos vectores, capas o transparencias
    const flatten = heavy || (slow && CFG.aplanarSiEsLento);
    const base = file.name.replace(/\.pdf$/i, "");
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const nums = g.pages.map((p) => p.n);
      if (groups.length === 1 && !flatten) { g.file = file; continue; }
      const name = groups.length > 1 ? `${base} - ${g.custom ? "personalizado" : g.sizeKey}.pdf` : `${base}.pdf`; // eslint-disable-line
      try {
        const progreso = (k, t) => setMsg(`Preparando el archivo para imprimir${groups.length > 1 ? ` (trabajo ${i + 1})` : ""}: página ${k} de ${t}…`);
        if (!flatten) {
          g.file = await buildFile(pdf, srcBytes, nums, name, false, progreso);
        } else {
          // siempre a 300 dpi; si no entra en el límite, se baja la compresión de a un paso
          for (const calidad of CFG.aplanadoCalidades) {
            g.file = await buildFile(pdf, srcBytes, nums, name, true, progreso, calidad);
            if (g.file.size <= CFG.maxBytes) break;
          }
          g.aplanado = true;
        }
        // si aplanarlo lo dejó más pesado que el límite pero el original entraba, se sube el original
        if (!heavy && g.file.size > CFG.maxBytes) {
          g.file = groups.length === 1 ? file : await buildFile(pdf, srcBytes, nums, name, false, () => {});
          g.aplanado = false;
        }
      } catch (err) {
        // si no se pudo separar sin aplanar (PDF raro), se aplana
        g.file = heavy ? null : await buildFile(pdf, srcBytes, nums, name, true, (k, t) => setMsg(`Preparando el archivo: página ${k} de ${t}…`));
        g.aplanado = Boolean(g.file);
      }
      if (g.file && g.file.size > CFG.maxBytes) {
        g.file = null;
        g.aplanado = false;
        g.note = "pesa demasiado aun achicado: mandalo por Drive o WeTransfer";
      }
    }
    st.groups = groups;
    const total = pages.length;
    const anyLink = groups.some((g) => !g.file);
    setMsg(`Listo: <b>${esc(file.name)}</b> · ${total} ${total === 1 ? "página" : "páginas"} · ${kb(file.size)}` +
      (flatten && !anyLink ? ` → lo dejamos listo para imprimir sin trabas (${kb(groups.reduce((s, g) => s + g.file.size, 0))}).` : "") +
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
    $("lector-paso").classList.add("hidden");
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
      $("lector-paso").innerHTML = "✓ Listo: ya están todos los trabajos del archivo. Completá tus datos y enviá el pedido, o subí otro PDF.";
      // ya no queda nada por configurar: se esconden las opciones y queda solo la lista de trabajos agregados
      setMode("listo");
    }
  });
}

setMode("espera");
bind();
