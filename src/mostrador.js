/* 29 BIS · Mostrador (uso interno). Habla con el Apps Script de la planilla de pedidos. */
(function () {
  "use strict";
  const config = window.APP_CONFIG || {};
  const PRICING = window.PRICING_DATA || { papers: {}, labels: { sizes: {} }, laser: { discounts: [] } };
  const API = config.ordersWebhookUrl;
  const $ = (id) => document.getElementById(id);
  const money = (n) => (n < 0 ? "− " : "") + "$ " + Math.abs(Math.round(n || 0)).toLocaleString("es-AR");
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const COV = { lineas: "Líneas", mixto: "Mixto", pleno: "Pleno" };
  const DISCOUNTS = (PRICING.laser && PRICING.laser.discounts) || [];
  const PAYOPTS = [["efectivo", "Efectivo"], ["qr", "QR / tarjeta"], ["mp", "Transferencia MP"], ["banco", "Transferencia banco (empresas)", "minor"]];
  const PAYLBL = { efectivo: "Efectivo", qr: "QR / tarjeta", mp: "Transferencia MP", banco: "Transferencia banco" };
  const FLOW = [["En revisión", "En revisión"], ["En preparación", "En preparación"], ["Listo para retirar", "Listo"]];
  const OTHER = [["Ver email", "Ver email"], ["Pendiente", "Pendiente"], ["Cancelado", "Cancelado"]];

  const st = {
    sesion: "", user: "", data: { pedidos: [], cobros: [], saldos: [] }, loaded: false,
    P: {}, rows: [],
    // presencial
    kind: "imp", machine: "laser", paper: "obra_80", size: "A4", faz: "sf", q: { lineas: 0, mixto: 0, pleno: 0, u: 0 },
    lines: [], cli: "", pay: "", sena: false, svc: "refilado", svcOpt: "", libCat: "lib",
    // filtros
    fTipo: "todos", fEst: "pend", fSolo: "", t2: "pend"
  };

  // ---------- servidor ----------
  async function api(accion, extra) {
    const body = Object.assign({ mostrador: true, accion, sesion: st.sesion }, extra || {});
    const res = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
    const json = await res.json();
    if (json && json.sesion === false) {
      logout(json.message);
      throw new Error(json.message);
    }
    return json;
  }
  let busyCount = 0;
  function busy(on) { busyCount += on ? 1 : -1; $("busy").style.display = busyCount > 0 ? "block" : "none"; }
  async function act(accion, extra, okMsg) {
    busy(true);
    try {
      const r = await api(accion, extra);
      if (!r.ok) { toast(r.message || "No se pudo guardar.", true); return null; }
      if (okMsg) toast(typeof okMsg === "function" ? okMsg(r) : okMsg);
      await load();
      return r;
    } catch (err) {
      toast("No hay conexión con la planilla. Probá de nuevo.", true);
      return null;
    } finally { busy(false); }
  }
  async function load(silent) {
    try {
      const r = await api("datos");
      if (!r.ok) { if (!silent) toast(r.message || "No se pudieron leer los pedidos.", true); return; }
      st.data = r; st.loaded = true;
      $("updated").textContent = "Actualizado " + new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
      renderProd(); renderOrders(); renderCobros();
    } catch (err) { if (!silent) toast("No hay conexión con la planilla.", true); }
  }

  // ---------- login ----------
  function saveSession() { try { localStorage.setItem("most_sesion", JSON.stringify({ s: st.sesion, u: st.user })); } catch (x) { /* sin almacenamiento */ } }
  function logout(msg) {
    st.sesion = ""; st.user = "";
    try { localStorage.removeItem("most_sesion"); } catch (x) { /* nada */ }
    $("login").style.display = "flex"; $("pwErr").textContent = msg || ""; $("pw").value = ""; $("pw").focus();
  }
  async function enter() {
    const clave = $("pw").value.trim();
    if (!clave) return;
    $("enter").disabled = true; $("pwErr").textContent = "";
    try {
      const r = await api("login", { clave });
      if (!r.ok) { $("pwErr").textContent = r.message || "Contraseña incorrecta"; return; }
      st.sesion = r.sesion; st.user = r.usuario; saveSession(); start();
    } catch (err) { $("pwErr").textContent = "No hay conexión. Probá de nuevo."; }
    finally { $("enter").disabled = false; }
  }
  function start() {
    $("who").textContent = st.user; $("login").style.display = "none"; $("pw").value = "";
    load();
  }
  $("enter").onclick = enter;
  $("pw").onkeydown = (e) => { if (e.key === "Enter") enter(); };
  $("out").onclick = () => logout("");
  $("refresh").onclick = () => load();

  // ---------- helpers ----------
  function seg(el, opts, cur, cb) {
    el.innerHTML = "";
    opts.forEach(([v, l, cls]) => {
      const b = document.createElement("button");
      b.textContent = l; b.className = (v === cur ? "on " : "") + (cls || "");
      b.onclick = () => cb(v); el.appendChild(b);
    });
  }
  function hhmm(d) { return (d || new Date()).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }); }
  function todayKey() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function toast(msg, bad) {
    const t = $("toast"); t.textContent = msg; t.style.background = bad ? "var(--danger)" : "var(--ok)"; t.style.display = "block";
    clearTimeout(t._h); t._h = setTimeout(() => { t.style.display = "none"; }, bad ? 4500 : 2800);
  }
  function machinesOf(p) {
    const set = new Set();
    (p.trabajos || []).forEach((w) => { if (w.maquina) set.add(w.maquina); });
    if (!set.size) { const t = (p.tipo || "").toLowerCase(); if (t.includes("laser") || t.includes("láser")) set.add("laser"); if (t.includes("plotter")) set.add("plotter"); }
    return set;
  }
  // "dd/mm/aaaa hh:mm" → días que pasaron (o null)
  function diasDesde(txt) {
    const m = String(txt || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return Math.round((hoy - d) / 86400000);
  }
  function normEstado(e) { return String(e || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }

  // ---------- PRODUCCIÓN ----------
  function renderProd() {
    const all = st.data.pedidos || [];
    const activos = all.filter((p) => !["listo para retirar", "cancelado", "retirado", "no retirado"].includes(normEstado(p.estado)));
    $("nprod").textContent = activos.length;
    const cnt = (e) => activos.filter((p) => normEstado(p.estado) === normEstado(e)).length;
    $("pcount").innerHTML = [["En revisión"], ["En preparación"], ["Ver email"], ["Pendiente"]].map(([k]) => `<div>${k}<span>${cnt(k)}</span></div>`).join("") +
      `<div>Urgentes<span style="color:var(--primary-strong)">${activos.filter((p) => p.urgente).length}</span></div>`;
    seg($("fTipo"), [["todos", "Todas"], ["laser", "Láser"], ["plotter", "Plotter"]], st.fTipo, (v) => { st.fTipo = v; renderProd(); });
    seg($("fEst"), [["pend", "Por hacer"], ["En revisión", "En revisión"], ["En preparación", "En preparación"], ["Ver email", "Ver email"], ["Pendiente", "Pendiente"], ["Cancelado", "Cancelados"]], st.fEst, (v) => { st.fEst = v; renderProd(); });
    seg($("fSolo"), [["", "—"], ["urg", "Urgentes"], ["svc", "Con servicios"]], st.fSolo, (v) => { st.fSolo = v; renderProd(); });
    const q = $("fq").value.trim().toLowerCase();
    const list = all.filter((p) => {
      const e = normEstado(p.estado);
      if (e === "listo para retirar" || e === "retirado" || e === "no retirado") return false;
      if (st.fEst === "Cancelado") { if (e !== "cancelado") return false; } else if (e === "cancelado") return false;
      if (st.fEst !== "pend" && st.fEst !== "Cancelado" && e !== normEstado(st.fEst)) return false;
      if (st.fTipo !== "todos" && !machinesOf(p).has(st.fTipo)) return false;
      if (st.fSolo === "urg" && !p.urgente) return false;
      if (st.fSolo === "svc" && !p.servicios) return false;
      if (q) {
        const hay = [p.n, p.cliente, p.papel, p.detalle, p.tamano].concat((p.trabajos || []).map((w) => w.detalle)).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const today = todayKey();
    const nowHM = hhmm();
    const groupOf = (p) => {
      if (p.urgente) return { k: "0", t: "Urgentes" };
      if (p.retiro === "sin_apuro") return { k: "8", t: "Sin apuro" };
      if (!p.retiro) return { k: "9", t: "Sin horario" };
      const [d, h] = p.retiro.split("T");
      if (d < today) return { k: "1", t: "De días anteriores", late: true };
      if (d === today) return { k: "2" + h, t: "Para las " + h, late: h < nowHM };
      const dd = new Date(d + "T12:00");
      return { k: "7" + d, t: "Para el " + dd.toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "2-digit" }), other: true };
    };
    const groups = {};
    list.forEach((p) => { const g = groupOf(p); (groups[g.k] = groups[g.k] || { g, items: [] }).items.push(p); });
    const keys = Object.keys(groups).sort();
    $("plist").innerHTML = !st.loaded ? '<p class="hint">Cargando pedidos…</p>' : keys.length ? keys.map((k) => {
      const { g, items } = groups[k];
      items.sort((a, b) => String(a.retiro).localeCompare(String(b.retiro)) || Number(a.n) - Number(b.n));
      const late = g.late && st.fEst !== "Cancelado";
      return `<div class="grp${late ? " late" : ""}${g.other ? " other" : ""}">${esc(g.t)} <small>${items.length} pedido${items.length > 1 ? "s" : ""}${late ? " · ¡atrasado!" : ""}</small></div>` + items.map(card).join("");
    }).join("") : '<p class="hint">No hay pedidos con esos filtros.</p>';
    $("plist").querySelectorAll(".po").forEach((el) => {
      const p = all.find((x) => String(x.n) === el.dataset.n);
      el.querySelectorAll(".steps button[data-e]").forEach((b) => { b.onclick = () => setEstado(p, b.dataset.e); });
      el.querySelector(".other").onchange = (e) => { if (e.target.value) setEstado(p, e.target.value); };
      const more = el.querySelector(".more");
      if (more) more.onclick = () => {
        const w = el.querySelector(".works"); const open = w.style.display === "none";
        w.style.display = open ? "" : "none"; more.textContent = open ? "Ocultar trabajos ▴" : `Ver los ${p.trabajos.length} trabajos ▾`;
      };
    });
  }
  function horaLabel(p) {
    if (p.urgente) return "URGENTE";
    if (p.retiro === "sin_apuro") return "sin apuro";
    if (!p.retiro) return "";
    const [d, h] = p.retiro.split("T");
    if (d === todayKey()) return h;
    const dd = new Date(d + "T12:00");
    return dd.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) + " " + h;
  }
  function single(p) {
    const w = (p.trabajos || [])[0];
    if (w) return w.detalle + (w.cantidad ? " · " + w.cantidad : "");
    return [p.tipo, p.papel, p.tamano, p.detalle].filter(Boolean).join(" · ");
  }
  function obsHtml(p) {
    if (!p.obs) return "";
    const largo = p.obs.length > 110 || (p.obs.match(/\n/g) || []).length > 1;
    return `<div class="obs">“${esc(p.obs)}”</div>${largo ? '<button class="linkbtn obsmore">Ver observación completa ▾</button>' : ""}`;
  }
  // "Ver observación completa": funciona en Producción y en Entregar pedidos
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".obsmore"); if (!b) return;
    const o = b.previousElementSibling; const open = o.classList.toggle("open");
    b.textContent = open ? "Ver menos ▴" : "Ver observación completa ▾";
  });
  function card(p) {
    const works = p.trabajos || [];
    const multi = works.length > 1;
    const e = normEstado(p.estado);
    const machines = machinesOf(p);
    const paidOnline = (p.pago || "").toLowerCase() === "pagado";
    return `<div class="po${p.urgente ? " urg" : ""}${p.servicios ? " svc" : ""}${e === "cancelado" ? " canc" : ""}" data-n="${esc(p.n)}">
      <div class="num">${esc(p.n)}<small>${esc(horaLabel(p))}</small></div>
      <div class="info"><b>${esc(p.cliente)}</b> <span class="det">· ${esc(multi ? works.length + " trabajos" : single(p))}</span>
        <div class="badges">${p.urgente ? '<span class="bd urg">Urgente</span>' : ""}${machines.size > 1 ? '<span class="bd">Láser + Plotter</span>' : ""}${p.servicios ? `<span class="bd svc">+ ${esc(p.servicios.replace(/\n/g, " · ").slice(0, 120))}</span>` : ""}${["ver email", "pendiente"].includes(e) ? `<span class="bd est">${esc(p.estado)}</span>` : ""}<span class="bd${paidOnline ? " paid" : ""}">${paidOnline ? "Pagado" : esc(p.formaPago || "")}</span>${p.total ? `<span class="bd">${money(p.total)}</span>` : ""}</div>
        ${multi ? `<button class="linkbtn more">Ver los ${works.length} trabajos ▾</button>
        <div class="works" style="display:none">${works.map((w, i) => `<div class="wk"><b>Trabajo ${i + 1}</b> · ${esc(w.detalle)}${w.cantidad ? " · " + esc(w.cantidad) : ""}${w.servicios ? ` <span class="bd svc">+ ${esc(w.servicios)}</span>` : ""}${w.archivo ? `<div class="hint">📎 ${esc(w.archivo)}</div>` : ""}</div>`).join("")}</div>` : ""}
        ${obsHtml(p)}</div>
      <div class="steps">${p.link ? `<a class="files" href="${esc(p.link)}" target="_blank" rel="noopener">📎 Archivos</a>` : ""}${FLOW.map(([k, l]) => `<button data-e="${k}" class="${normEstado(p.estado) === normEstado(k) ? "on" : ""}" data-x="${normEstado(k)}">${l}</button>`).join("")}
        <select class="other${OTHER.some((x) => normEstado(x[0]) === e) ? " on" : ""}"><option value="">Otro…</option>${OTHER.map(([k, l]) => `<option value="${k}"${normEstado(k) === e ? " selected" : ""}>${l}</option>`).join("")}</select></div>
    </div>`;
  }
  async function setEstado(p, estado) {
    if (normEstado(estado) === normEstado(p.estado)) return;
    if (estado === "Cancelado" && !confirm(`¿Cancelar el pedido ${p.n} de ${p.cliente}?`)) { renderProd(); return; }
    await act("estado", { pedido: p.n, estado }, () =>
      estado === "Listo para retirar" ? `Pedido ${p.n} listo · se le avisó al cliente y pasó a "Entregar pedidos"` :
      estado === "Ver email" ? `Pedido ${p.n} → Ver email · se le avisó al cliente` :
      estado === "Cancelado" ? `Pedido ${p.n} cancelado` : `Pedido ${p.n} → ${estado}`);
  }
  $("fq").oninput = renderProd;

  // ---------- precios para el presencial ----------
  async function loadPrices() {
    try {
      const res = await fetch(config.pricesJsonUrl, { cache: "no-store" });
      const j = await res.json();
      st.rows = (j.priceRows || []).filter((r) => r.active !== false);
    } catch (err) {
      toast("No se pudieron leer los precios. Recargá la página.", true);
      st.rows = [];
    }
    st.P = {};
    st.rows.forEach((r) => { st.P[[r.machine, r.paper_key, r.size_key, r.coverage_key || "", r.side_key || ""].join("|")] = Number(r.price); });
    renderKind(); renderForm(); renderTicket();
  }
  const label = (k) => (PRICING.papers[k] && PRICING.papers[k].label) || k;
  // En algunos papeles láser el SA3 se muestra con otro nombre (igual que en la web).
  const SIZE_LABEL_OVERRIDES = { vegetal: { SA3: "A3" }, reciclado_nat: { SA3: "A3" } };
  const sizeLabel = (s) => {
    if (s === "100x100_personalizado") return "Personalizado";
    const o = st.machine === "laser" && SIZE_LABEL_OVERRIDES[st.paper];
    return (o && o[s]) || (PRICING.labels.sizes || {})[s] || s;
  };
  function papersFor(m) {
    const seen = []; st.rows.forEach((r) => { if (r.machine === m && !seen.includes(r.paper_key)) seen.push(r.paper_key); });
    const order = (PRICING.machines && PRICING.machines[m] && PRICING.machines[m].papers) || [];
    return seen.sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
  }
  function sizesFor(m, p) {
    const s = []; st.rows.forEach((r) => { if (r.machine === m && r.paper_key === p && !s.includes(r.size_key)) s.push(r.size_key); });
    const order = ["A4", "A3", "SA3", "A2", "A1", "A0", "35x50", "50x70", "70x100", "100x100_personalizado"];
    return s.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  }
  function fazesFor() {
    const f = []; st.rows.forEach((r) => { if (r.machine === "laser" && r.paper_key === st.paper && r.size_key === st.size && r.side_key && !f.includes(r.side_key)) f.push(r.side_key); });
    return f.sort();
  }
  function usesCov() { return st.machine === "plotter" || (st.paper === "obra_80" && st.faz === "sf"); }
  function unit(cov) {
    if (st.machine === "plotter") return st.P[["plotter", st.paper, st.size, cov, ""].join("|")];
    if (st.paper === "obra_80") return st.P[["laser", "obra_80", st.size, st.faz === "df" ? "lineas" : cov, st.faz].join("|")];
    return st.P[["laser", st.paper, st.size, "", st.faz].join("|")];
  }
  function dims() { const n = (v) => Number(String(v || "").replace(",", ".")) || 0; return { w: n($("cw").value), h: n($("ch").value) }; }
  function customErr() {
    const { w, h } = dims(); if (!w || !h) return "Cargá ancho y alto.";
    const big = Math.max(w, h), sm = Math.min(w, h);
    if (big >= 10) return "Parece que está en mm o cm: escribila en metros (900 mm = 0,9)."; if (big > 3) return "Máximo 3 m por lado."; if (sm < 0.35) return "Mínimo 0,35 m por lado."; return "";
  }

  // ---------- PRESENCIAL ----------
  const SVCS = {
    anillado: { l: "Anillado", u: "trabajo" },
    abrochado: { l: "Abrochado", u: "trabajo" },
    laminado: { l: "Laminado", u: "hoja" },
    refilado: { l: "Refilado", u: "hoja" },
    troquelado: { l: "Troquelado", u: "hoja" },
    empanelado: { l: "Empanelado", u: "m²" }
  };
  // Solo estas filas de "servicio" son precios; las demás (dias, descuentos, máximos) son reglas.
  const PRICE_CONCEPTS = {
    anillado: { trabajo: "" }, abrochado: { trabajo: "" },
    empanelado: { carton_corrugado: "Cartón corrugado", carton_pluma: "Cartón pluma" },
    laminado: { hoja: "" }, troquelado: { hoja: "" },
    refilado: { hoja: "Por hoja", con_abrochado: "Con abrochado (precio por trabajo)" }
  };
  function svcRule(key, concept) {
    const r = st.rows.find((x) => x.machine === "servicio" && x.paper_key === key && x.coverage_key === concept);
    return r ? Number(r.price) : null;
  }
  function svcOptions(key) {
    const opts = []; const allowed = PRICE_CONCEPTS[key] || {};
    st.rows.forEach((r) => {
      if (r.machine !== "servicio" || r.paper_key !== key) return;
      const concept = r.coverage_key || "";
      if (!(concept in allowed)) return;
      const price = Number(r.price); if (!(price > 0)) return;
      const v = [r.size_key, concept, r.side_key || ""].join("|");
      if (opts.some((o) => o[0] === v)) return;
      const parts = [r.size_key && r.size_key !== "todos" ? r.size_key : "", allowed[concept], r.side_key === "sf" ? "simple faz" : r.side_key === "df" ? "doble faz" : ""].filter(Boolean);
      // unidad de cobro de esta opción
      const u = concept === "con_abrochado" ? "trabajo" : SVCS[key].u;
      opts.push([v, parts.join(" ") || "Único", price, u]);
    });
    return opts;
  }
  const UNIT_TXT = (u, n) => u === "trabajo" ? (n === 1 ? "trabajo" : "trabajos") : u === "hoja" ? (n === 1 ? "hoja" : "hojas") : "m²";
  function troqDesc() {
    const rate = svcRule("troquelado", "descuento_porcentaje"), from = svcRule("troquelado", "descuento_desde_hojas");
    return rate > 0 && from > 0 ? { rate: rate / 100, from } : null;
  }
  function renderKind() {
    seg($("kind"), [["imp", "Impresión"], ["svc", "Servicio"], ["lib", "Librería / otro"]], st.kind, (v) => { st.kind = v; renderKind(); });
    $("pImp").style.display = st.kind === "imp" ? "" : "none"; $("pSvc").style.display = st.kind === "svc" ? "" : "none"; $("pLib").style.display = st.kind === "lib" ? "" : "none";
    const keys = Object.keys(SVCS).filter((k) => svcOptions(k).length);
    if (!keys.includes(st.svc)) st.svc = keys[0] || "refilado";
    seg($("svcSel"), keys.map((k) => [k, SVCS[k].l]), st.svc, (v) => { st.svc = v; st.svcOpt = ""; $("sQty").value = 1; renderKind(); });
    const opts = svcOptions(st.svc);
    if (!opts.some((o) => o[0] === st.svcOpt)) st.svcOpt = opts[0] ? opts[0][0] : "";
    $("svcOptF").style.display = opts.length > 1 ? "" : "none";
    $("svcOptL").textContent = st.svc === "empanelado" ? "Soporte" : st.svc === "refilado" ? "Cómo se cobra" : "Tamaño";
    seg($("svcOpt"), opts.map((o) => [o[0], o[1]]), st.svcOpt, (v) => { st.svcOpt = v; renderKind(); });
    const sel = opts.find((o) => o[0] === st.svcOpt);
    const u = sel ? sel[3] : (SVCS[st.svc] || { u: "trabajo" }).u;
    $("svcQtyL").textContent = u === "m²" ? "Metros cuadrados" : u === "hoja" ? "Cantidad de hojas" : "Cantidad de trabajos";
    $("sQty").step = u === "m²" ? "0.1" : "1";
    const d = st.svc === "troquelado" ? troqDesc() : null;
    $("sUnit").textContent = sel ? `${money(sel[2])} por ${u}` + (d ? ` · desde ${d.from} hojas del mismo diseño: ${Math.round(d.rate * 100)}% menos` : "") : "";
    $("troqF").style.display = d ? "" : "none";
    seg($("libCat"), [["lib", "Librería"], ["otro", "Otro cobro"]], st.libCat, (v) => { st.libCat = v; renderKind(); });
  }
  $("sMinus").onclick = () => { $("sQty").value = Math.max(0, (Number($("sQty").value) || 0) - 1); };
  $("sPlus").onclick = () => { $("sQty").value = (Number($("sQty").value) || 0) + 1; };
  $("addSvc").onclick = () => {
    const d = SVCS[st.svc]; const opts = svcOptions(st.svc); const sel = opts.find((o) => o[0] === st.svcOpt);
    const n = Number(String($("sQty").value).replace(",", ".")) || 0;
    if (!sel) { toast("Ese servicio no tiene precio cargado.", true); return; }
    if (n <= 0) { toast("Cargá la cantidad", true); return; }
    let total = sel[2] * n, extra = "";
    const desc = st.svc === "troquelado" ? troqDesc() : null;
    if (desc && $("troqMismo").checked && n >= desc.from) { total = total * (1 - desc.rate); extra = ` · ${Math.round(desc.rate * 100)}% menos (mismo diseño)`; }
    st.lines.push({ kind: "svc", total: Math.round(total), title: d.l + (opts.length > 1 ? " · " + sel[1] : ""), sub: `${n} ${UNIT_TXT(sel[3], n)} x ${money(sel[2])}${extra}` });
    $("sQty").value = 1; $("troqMismo").checked = false; renderTicket();
  };
  $("addLib").onclick = () => {
    const v = Number($("libMonto").value) || 0; const det = $("libDet").value.trim();
    if (!v) { toast("Cargá el monto", true); return; } if (!det) { toast("Escribí qué es", true); return; }
    st.lines.push({ kind: st.libCat, total: v, title: (st.libCat === "lib" ? "Librería" : "Otro cobro") + " · " + det, sub: "" });
    $("libMonto").value = ""; $("libDet").value = ""; renderTicket();
  };

  function renderForm() {
    seg($("machine"), [["laser", "Láser"], ["plotter", "Plotter"]], st.machine, (v) => { st.machine = v; st.paper = papersFor(v)[0] || ""; st.size = sizesFor(v, st.paper)[0]; renderForm(); });
    const ps = papersFor(st.machine); if (!ps.includes(st.paper)) st.paper = ps[0] || "";
    $("paper").innerHTML = ps.map((p) => `<option value="${p}"${p === st.paper ? " selected" : ""}>${esc(label(p))}</option>`).join("");
    const sizes = sizesFor(st.machine, st.paper); if (!sizes.includes(st.size)) st.size = sizes[0];
    seg($("size"), sizes.map((s) => [s, sizeLabel(s)]), st.size, (v) => { st.size = v; renderForm(); });
    $("customF").style.display = st.size === "100x100_personalizado" ? "" : "none";
    const fazes = st.machine === "laser" ? fazesFor() : [];
    $("fazF").style.display = fazes.length ? "" : "none"; if (fazes.length && !fazes.includes(st.faz)) st.faz = fazes[0];
    seg($("faz"), fazes.map((f) => [f, f === "sf" ? "Simple faz" : "Doble faz"]), st.faz, (v) => { st.faz = v; renderForm(); });
    const keys = usesCov() ? ["lineas", "mixto", "pleno"] : ["u"];
    $("qty").innerHTML = '<div class="qty"' + (keys.length === 1 ? ' style="grid-template-columns:1fr"' : "") + ">" + keys.map((k) => {
      const u = unit(k === "u" ? "lineas" : k);
      return `<div class="q"><span>${k === "u" ? "Hojas" : COV[k]}</span><div class="stepper"><button data-k="${k}" data-d="-1">−</button><input type="number" min="0" data-k="${k}" value="${st.q[k]}"><button data-k="${k}" data-d="1">+</button></div><small>${u ? money(u) + (st.size === "100x100_personalizado" ? " / m²" : " c/u") : "—"}</small></div>`;
    }).join("") + "</div>";
    $("qty").querySelectorAll("button").forEach((b) => { b.onclick = () => { const k = b.dataset.k; st.q[k] = Math.max(0, (st.q[k] || 0) + Number(b.dataset.d)); renderForm(); }; });
    $("qty").querySelectorAll("input").forEach((i) => { i.oninput = () => { st.q[i.dataset.k] = Math.max(0, Number(i.value) || 0); }; });
  }
  $("paper").onchange = (e) => { st.paper = e.target.value; renderForm(); };
  $("cw").oninput = $("ch").oninput = () => { $("customErr").textContent = ""; };
  $("addBtn").onclick = () => {
    const custom = st.size === "100x100_personalizado";
    if (custom) { const e = customErr(); if (e) { $("customErr").textContent = e; return; } }
    const { w, h } = dims(); const area = custom ? w * h : 1;
    const keys = usesCov() ? ["lineas", "mixto", "pleno"] : ["u"];
    let total = 0, sheets = 0; const parts = [];
    for (const k of keys) {
      const n = st.q[k] || 0; if (!n) continue;
      const u = unit(k === "u" ? "lineas" : k);
      if (!u) { toast("Esa combinación no tiene precio cargado.", true); return; }
      total += u * n * area; sheets += n; parts.push(k === "u" ? `${n} hojas` : `${n} ${COV[k].toLowerCase()}`);
    }
    if (!sheets) { toast("Cargá al menos una hoja", true); return; }
    const sizeTxt = custom ? `${w.toFixed(2)} x ${h.toFixed(2)} m` : sizeLabel(st.size);
    st.lines.push({ kind: st.machine, sheets, total: Math.round(total), title: `${st.machine === "laser" ? "Láser" : "Plotter"} · ${label(st.paper)} · ${sizeTxt}${st.machine === "laser" ? " · " + (st.faz === "sf" ? "SF" : "DF") : ""}`, sub: parts.join(" · ") });
    st.q = { lineas: 0, mixto: 0, pleno: 0, u: 0 }; renderForm(); renderTicket();
  };
  function tipoTrabajo() {
    const k = new Set(st.lines.map((l) => l.kind)); const L = k.has("laser"), Pl = k.has("plotter");
    if (L && Pl) return "M"; if (L) return "L"; if (Pl) return "P"; if (k.has("svc")) return "SER"; return "LIB";
  }
  const TIPO_LBL = { M: "M (mixto)", L: "L (láser)", P: "P (plotter)", SER: "SER (servicio)", LIB: "LIB (librería / otro)" };
  function totals() {
    const laser = st.lines.filter((l) => l.kind === "laser");
    const ls = laser.reduce((a, l) => a + l.sheets, 0); const lsub = laser.reduce((a, l) => a + l.total, 0);
    const tier = DISCOUNTS.find((d) => ls >= d.minSheets); const rate = tier ? tier.rate : 0;
    const disc = Math.round(lsub * rate); const sub = st.lines.reduce((a, l) => a + l.total, 0);
    return { sub, rate, disc, total: Math.round(sub - disc) };
  }
  // Pago dividido: texto "Efectivo $ x + QR $ y"
  const partesTxt = (pagos) => pagos.map((p) => `${PAYLBL[p.medio]} ${money(p.monto)}`).join(" + ");
  function senaVal() { return st.sena ? Math.max(0, Number($("senaMonto").value) || 0) : 0; }
  function renderTicket() {
    $("lines").innerHTML = st.lines.length ? st.lines.map((l, i) => `<div class="line"><div class="d"><b>${esc(l.title)}</b><small>${esc(l.sub)}</small></div><strong>${money(l.total)}</strong><button class="x" data-i="${i}" title="Quitar">×</button></div>`).join("") : '<div class="empty">Todavía no hay nada en el ticket</div>';
    $("lines").querySelectorAll(".x").forEach((b) => { b.onclick = () => { st.lines.splice(Number(b.dataset.i), 1); renderTicket(); }; });
    const t = totals();
    $("tipoAuto").innerHTML = st.lines.length ? "Se registra como: <b>" + TIPO_LBL[tipoTrabajo()] + "</b>" : "";
    $("sum").innerHTML = `<div><span>Subtotal</span><span>${money(t.sub)}</span></div>` + (t.disc ? `<div class="disc"><span>Descuento láser por cantidad (${Math.round(t.rate * 100)}%)</span><span>− ${money(t.disc)}</span></div>` : "") + `<div class="tot"><span>Total</span><span>${money(t.total)}</span></div>`;
    seg($("cli"), [["ARQ", "Arquitectura"], ["DG", "Diseño gráfico"], ["DI", "Diseño industrial"], ["Otros", "Otros"]], st.cli, (v) => { st.cli = v; renderTicket(); });
    seg($("pay"), PAYOPTS, st.pay, (v) => { st.pay = v; if (st.pay2 === v) st.pay2 = ""; renderTicket(); });
    const s = senaVal();
    const base = st.sena ? s : t.total;
    $("splitBtn").textContent = st.split ? "Cancelar: paga todo con un solo medio" : "Paga con dos medios (ej: parte efectivo y parte QR)";
    $("split").style.display = st.split ? "" : "none";
    seg($("pay2"), PAYOPTS.filter(([m]) => m !== st.pay), st.pay2, (v) => { st.pay2 = v; renderTicket(); });
    $("split1L").textContent = st.pay ? `Cuánto paga con ${PAYLBL[st.pay]}` : "Primero elegí el primer medio arriba";
    const a1 = Math.round(Number($("split1").value) || 0);
    $("split2Txt").innerHTML = st.split && st.pay2 && a1 > 0 && a1 < base ? `Con ${PAYLBL[st.pay2]}: <b>${money(base - a1)}</b>` : "";
    $("sena").style.display = st.sena ? "" : "none";
    $("senaBtn").textContent = st.sena ? "Cancelar seña: el cliente paga todo ahora" : "El cliente deja una seña y paga el resto al retirar";
    $("saldoTxt").innerHTML = st.sena && s > 0 && s < t.total ? `Saldo a cobrar al retirar: <b>${money(t.total - s)}</b>` : "";
    const soloLib = st.lines.length && st.lines.every((l) => l.kind === "lib" || l.kind === "otro");
    $("cliReq").style.display = soloLib ? "none" : ""; $("cliOpt").style.display = soloLib ? "" : "none";
    const missing = !st.lines.length ? "Agregá algo al ticket" : (!soloLib && !$("cn").value.trim()) ? "Falta el nombre del cliente" : (!soloLib && !$("cd").value.trim()) ? "Falta el DNI o CUIT" : !st.cli ? "Elegí el tipo de cliente" : !st.pay ? "Elegí el medio de pago" : (st.sena && !(s > 0 && s < t.total)) ? "La seña tiene que ser menor al total" : (st.split && !st.pay2) ? "Elegí el segundo medio de pago" : (st.split && !(a1 > 0 && a1 < base)) ? `Cargá cuánto paga con ${PAYLBL[st.pay]} (menos de ${money(base)})` : "";
    $("cobrar").disabled = Boolean(missing); $("why").textContent = missing;
    $("cobrar").textContent = missing ? "Cobrar" : st.sena ? `Cobrar seña de ${money(s)} y registrar` : `Cobrar ${money(t.total)} y registrar`;
  }
  $("cn").oninput = $("cd").oninput = $("senaMonto").oninput = $("split1").oninput = renderTicket;
  $("splitBtn").onclick = () => { st.split = !st.split; if (!st.split) { st.pay2 = ""; $("split1").value = ""; } renderTicket(); };
  $("senaBtn").onclick = () => { st.sena = !st.sena; if (!st.sena) $("senaMonto").value = ""; renderTicket(); };
  $("cobrar").onclick = async () => {
    const t = totals(); const s = senaVal();
    const base = st.sena ? s : t.total; const a1 = Math.round(Number($("split1").value) || 0);
    const pagos = st.split ? [{ medio: st.pay, monto: a1 }, { medio: st.pay2, monto: base - a1 }] : [{ medio: st.pay, monto: base }];
    const detalle = st.lines.map((l) => l.title + (l.sub ? " (" + l.sub + ")" : "")).join(" + ");
    $("cobrar").disabled = true;
    const r = await act("presencial", { total: t.total, sena: st.sena ? s : 0, detalle, tipoTrabajo: tipoTrabajo(), tipoCliente: st.cli, cliente: $("cn").value.trim(), dni: $("cd").value.trim(), medio: st.pay, pagos },
      (res) => st.sena ? `✓ Seña registrada ${res.comprobante} · ${partesTxt(pagos)} · saldo ${money(t.total - s)} en "Entregar pedidos"` : `✓ Registrado ${res.comprobante} · ${res.hora} · ${partesTxt(pagos)}`);
    if (r) {
      st.lines = []; st.cli = ""; st.pay = ""; st.sena = false; st.split = false; st.pay2 = ""; $("cn").value = ""; $("cd").value = ""; $("senaMonto").value = ""; $("split1").value = "";
    }
    renderTicket();
  };

  // ---------- ENTREGAR ----------
  function renderOrders() {
    const peds = st.data.pedidos || [];
    const saldos = (st.data.saldos || []).map((s) => ({ kind: "saldo", n: s.comprobante, cliente: s.cliente, dni: s.dni, detalleTxt: s.detalle, total: s.saldo, info: `Seña ${money(s.sena)} pagada el ${s.fecha} · saldo al retirar` }));
    const pend = peds.filter((p) => !["retirado", "cancelado", "no retirado"].includes(normEstado(p.estado)));
    const noRet = peds.filter((p) => normEstado(p.estado) === "no retirado");
    $("npend").textContent = pend.filter((p) => normEstado(p.estado) === "listo para retirar").length + saldos.length;
    seg($("t2mode"), [["pend", "Para entregar"], ["done", "Entregados hoy"], ["no", `No retirados (${noRet.length})`]], st.t2, (v) => { st.t2 = v; renderOrders(); });
    const q = $("q").value.trim().toLowerCase();
    const match = (o) => !q || String(o.n).toLowerCase().includes(q) || String(o.cliente).toLowerCase().includes(q) || String(o.dni || "").includes(q);
    let list;
    if (st.t2 === "pend") {
      // Solo los listos para retirar; los demás aparecen únicamente si los buscás (por si alguien se olvidó de pasarlo a listo).
      const base = q ? pend : pend.filter((p) => normEstado(p.estado) === "listo para retirar");
      list = base.map((p) => Object.assign({ kind: "web" }, p)).concat(saldos).filter(match);
      list.sort((a, b) => (a.kind === "saldo" ? 0 : normEstado(a.estado) === "listo para retirar" ? 0 : 1) - (b.kind === "saldo" ? 0 : normEstado(b.estado) === "listo para retirar" ? 0 : 1) || Number(b.n) - Number(a.n));
    } else if (st.t2 === "no") {
      list = noRet.map((p) => Object.assign({ kind: "web" }, p)).filter(match);
    } else {
      list = peds.filter((p) => normEstado(p.estado) === "retirado").map((p) => Object.assign({ kind: "web" }, p)).filter(match);
    }
    $("results").innerHTML = list.length ? list.map(orderCard).join("") : `<p class="hint">${st.t2 === "no" ? "No hay pedidos marcados como no retirados en los últimos 45 días." : st.t2 === "pend" && !q ? "No hay pedidos listos para retirar." : "No hay pedidos con esa búsqueda."}</p>`;
    $("results").querySelectorAll(".order").forEach((cardEl) => bindOrder(cardEl, list.find((x) => String(x.n) === cardEl.dataset.n && x.kind === cardEl.dataset.k)));
  }
  function orderCard(o) {
    const paid = o.kind === "web" && (o.pago || "").toLowerCase() === "pagado";
    const delivered = normEstado(o.estado) === "retirado";
    const ready = normEstado(o.estado) === "listo para retirar";
    const noRet = normEstado(o.estado) === "no retirado";
    const dias = o.kind === "web" ? diasDesde(o.cambio) : null;
    const espera = ready && dias != null && dias >= 1 ? `<span class="bd${dias >= 7 ? " old" : ""}">Listo hace ${dias} día${dias > 1 ? "s" : ""}</span>` : "";
    const pill = o.kind === "saldo" ? '<span class="pill">Saldo de seña</span>' : noRet ? `<span class="pill">No retirado${dias == null ? "" : dias === 0 ? " · marcado hoy" : " · hace " + dias + " día" + (dias === 1 ? "" : "s")}</span>` : delivered ? '<span class="pill paid">Entregado</span>' : paid ? '<span class="pill paid">Pagado · falta entregar</span>' : '<span class="pill">Falta cobrar</span>';
    const estado = o.kind === "web" && !delivered && !noRet ? `<span class="bd${ready ? " paid" : " pend"}">${esc(o.estado)}</span> ${espera}` : "";
    const det = o.kind === "saldo" ? o.detalleTxt : ((o.trabajos || []).length > 1 ? o.trabajos.map((w, i) => `Trabajo ${i + 1}: ${w.detalle}${w.cantidad ? " · " + w.cantidad : ""}`).join("<br>") : esc(single(o)));
    const canPay = (o.kind === "saldo") || (o.kind === "web" && !paid && !delivered && !noRet);
    return `<div class="order" data-n="${esc(o.n)}" data-k="${o.kind}"><div class="top"><b>${o.kind === "saldo" ? "Saldo" : "Pedido web"} ${esc(o.n)} · ${esc(o.cliente)}</b>${pill}</div>
      <p class="hint">${o.kind === "saldo" ? esc(det) : det}<br>${o.kind === "saldo" ? esc(o.info) : esc(o.formaPago || "")} · DNI ${esc(o.dni || "—")} ${estado}</p>
      ${o.kind === "web" ? obsHtml(o) : ""}
      ${o.kind === "web" && o.link ? `<a class="files" href="${esc(o.link)}" target="_blank" rel="noopener" style="margin:4px 0 8px">📎 Ver archivos del pedido</a><br>` : ""}
      <b style="font:800 20px Montserrat,Arial,sans-serif">${money(o.total)}</b>
      ${canPay ? `<div class="seg pay" style="margin-top:8px">${PAYOPTS.map(([m, l, c]) => `<button data-a="sel" data-m="${m}" class="${c || ""}">${l}</button>`).join("")}</div><div class="confirm" data-for="pay" style="display:none"></div>
      <button class="linkbtn" data-a="split">Paga con dos medios</button>
      <div class="splitbox" style="display:none">
        <div class="field"><label>Primer medio</label><div class="seg pay sp1">${PAYOPTS.map(([m, l, c]) => `<button data-a="sp1" data-m="${m}" class="${c || ""}">${l}</button>`).join("")}</div></div>
        <div class="field"><label>Cuánto paga con el primer medio</label><input type="number" class="spm" placeholder="Monto"></div>
        <div class="field"><label>Segundo medio (el resto)</label><div class="seg pay sp2">${PAYOPTS.map(([m, l, c]) => `<button data-a="sp2" data-m="${m}" class="${c || ""}">${l}</button>`).join("")}</div></div>
        <p class="hint sptxt"></p>
        <button class="btn ok" data-a="spgo" style="width:100%">Cobrar y entregar</button><div class="confirm" data-for="spgo" style="display:none"></div>
      </div>` : ""}
      ${noRet ? `<button class="btn ok" data-a="react" style="width:100%;margin-top:8px">El cliente vino: volver a "Listo para retirar"</button><div class="confirm" data-for="react" style="display:none"></div>` : ""}
      ${o.kind === "web" && paid && !delivered ? `<button class="btn ok" data-a="deliver" style="width:100%;margin-top:8px">Entregar (ya está pagado)</button><div class="confirm" data-for="deliver" style="display:none"></div>` : ""}
      ${o.kind === "web" && !delivered && !noRet ? `<button class="linkbtn" data-a="noret">Marcar como no retirado</button><div class="confirm" data-for="noret" style="display:none"></div>` : ""}
      ${o.kind === "web" && !noRet ? `<button class="linkbtn" data-a="fix">Corregir cotización</button>
      <div class="fix" style="display:none">
        <div class="row2"><input type="number" class="fv" placeholder="Monto correcto"><input type="text" class="fm" placeholder="Motivo (ej: medida en mm)"></div>
        <div class="diff"></div>
        ${paid ? `<div class="seg pay" style="margin-top:8px">${PAYOPTS.map(([m, l, c]) => `<button data-a="fixsel" data-m="${m}" class="${c || ""}">${l}</button>`).join("")}</div><p class="hint">Elegí con qué se cobra o se devuelve la diferencia.</p><div class="confirm" data-for="fixpay" style="display:none"></div>` : `<button class="btn ok" data-a="fixok" style="margin-top:8px">Guardar monto correcto</button>`}
      </div>` : ""}</div>`;
  }
  function bindOrder(cardEl, o) {
    if (!o) return;
    const paid = o.kind === "web" && (o.pago || "").toLowerCase() === "pagado";
    const fix = cardEl.querySelector(".fix"), diffEl = cardEl.querySelector(".diff"), fv = cardEl.querySelector(".fv"), fm = cardEl.querySelector(".fm");
    if (fv) fv.oninput = () => {
      const v = Number(fv.value) || 0; const d = v - o.total; diffEl.className = "diff " + (d > 0 ? "more" : "less");
      diffEl.textContent = !v ? "" : paid ? (d > 0 ? `El cliente tiene que pagar ${money(d)} más` : d < 0 ? `Hay que devolverle ${money(-d)}` : "Sin diferencia") : `El cliente pagará ${money(v)}`;
    };
    function askConfirm(kind, btn, text, okText) {
      const box = cardEl.querySelector(`.confirm[data-for="${kind}"]`);
      btn.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === btn));
      box.innerHTML = `<p class="ctext">${text}</p><div class="row2"><button class="btn" data-c="no">Cancelar</button><button class="btn ok" data-c="yes">${okText}</button></div>`;
      box.style.display = "";
      return new Promise((resolve) => {
        box.querySelector("[data-c=no]").onclick = () => { box.style.display = "none"; btn.parentElement.querySelectorAll("button").forEach((x) => x.classList.remove("on")); resolve(false); };
        box.querySelector("[data-c=yes]").onclick = (ev) => { ev.target.disabled = true; resolve(true); };
      });
    }
    // pago dividido
    const sp = { m1: "", m2: "" }; const spBox = cardEl.querySelector(".splitbox"), spm = cardEl.querySelector(".spm");
    function spPagos() {
      const a1 = Math.round(Number(spm && spm.value) || 0);
      if (!sp.m1 || !sp.m2 || sp.m1 === sp.m2 || !(a1 > 0 && a1 < o.total)) return null;
      return [{ medio: sp.m1, monto: a1 }, { medio: sp.m2, monto: o.total - a1 }];
    }
    function spRender() {
      if (!spBox) return;
      spBox.querySelectorAll(".sp1 button").forEach((x) => x.classList.toggle("on", x.dataset.m === sp.m1));
      spBox.querySelectorAll(".sp2 button").forEach((x) => { x.classList.toggle("on", x.dataset.m === sp.m2); x.disabled = x.dataset.m === sp.m1; });
      const pg = spPagos(); const a1 = Math.round(Number(spm.value) || 0);
      spBox.querySelector(".sptxt").innerHTML = pg ? `${partesTxt(pg)} = <b>${money(o.total)}</b>` : (a1 >= o.total ? `El primer monto tiene que ser menor a ${money(o.total)}` : "Elegí los dos medios y cuánto paga con el primero.");
    }
    if (spm) spm.oninput = spRender;
    cardEl.querySelectorAll("button[data-a]").forEach((b) => {
      b.onclick = async () => {
        const a = b.dataset.a, m = b.dataset.m;
        if (a === "split") { const open = spBox.style.display === "none"; spBox.style.display = open ? "" : "none"; b.textContent = open ? "Cancelar: paga con un solo medio" : "Paga con dos medios"; spRender(); return; }
        if (a === "sp1") { sp.m1 = m; if (sp.m2 === m) sp.m2 = ""; spRender(); return; }
        if (a === "sp2") { sp.m2 = m; spRender(); return; }
        if (a === "spgo") {
          const pg = spPagos(); if (!pg) { toast("Completá los dos medios y el monto", true); return; }
          if (o.kind === "web" && o.total > 3000000) { toast("Ese monto parece mal cotizado: corregí la cotización antes de cobrar", true); return; }
          const ok = await askConfirm("spgo", b, `¿Cobrar a ${esc(o.cliente)} <b>${partesTxt(pg)}</b> (total ${money(o.total)}) y entregar?`, "Sí, cobrar y entregar");
          if (!ok) return;
          if (o.kind === "saldo") await act("cobrar_saldo", { comprobante: o.n, pagos: pg }, `✓ Saldo ${o.n} cobrado (${partesTxt(pg)})`);
          else await act("cobrar_web", { pedido: o.n, pagos: pg }, `✓ Pedido ${o.n} cobrado y entregado (${partesTxt(pg)})`);
          return;
        }
        if (a === "fix") { fix.style.display = fix.style.display === "none" ? "" : "none"; return; }
        if (a === "fixok") {
          const v = Number(fv.value) || 0; if (!v || !fm.value.trim()) { toast("Cargá el monto correcto y el motivo", true); return; }
          await act("corregir", { pedido: o.n, monto: v, motivo: fm.value.trim() }, `✓ Pedido ${o.n} corregido a ${money(v)}`); return;
        }
        if (a === "fixsel") {
          const v = Number(fv.value) || 0; if (!v || !fm.value.trim()) { toast("Cargá el monto correcto y el motivo", true); return; }
          const d = v - o.total; if (!d) { toast("No hay diferencia para registrar", true); return; }
          const ok = await askConfirm("fixpay", b, d > 0 ? `¿Cobrar <b>${money(d)}</b> extra a ${esc(o.cliente)} con <b>${PAYLBL[m]}</b>?` : `¿Registrar devolución de <b>${money(-d)}</b> a ${esc(o.cliente)} por <b>${PAYLBL[m]}</b>?`, d > 0 ? `Sí, cobrar ${money(d)}` : `Sí, devolver ${money(-d)}`);
          if (!ok) return;
          await act("corregir", { pedido: o.n, monto: v, motivo: fm.value.trim(), medio: m }, d > 0 ? `✓ Cobro extra de ${money(d)} registrado` : `✓ Devolución de ${money(-d)} registrada`); return;
        }
        if (a === "noret") {
          const ok = await askConfirm("noret", b, `¿Marcar el pedido <b>${esc(o.n)}</b> de ${esc(o.cliente)} como <b>no retirado</b>? Sale de la lista para entregar${paid ? " (ojo: figura como pagado)" : ""}. Si después aparece, lo volvés a activar desde "No retirados".`, "Sí, no lo retiró");
          if (!ok) return;
          await act("no_retirado", { pedido: o.n }, `✓ Pedido ${o.n} marcado como no retirado`); return;
        }
        if (a === "react") {
          const ok = await askConfirm("react", b, `¿Volver a poner el pedido <b>${esc(o.n)}</b> como listo para retirar? No se le manda aviso al cliente.`, "Sí, volver a activar");
          if (!ok) return;
          await act("reactivar", { pedido: o.n }, `✓ Pedido ${o.n} otra vez en "Para entregar"`); return;
        }
        if (a === "deliver") {
          const ok = await askConfirm("deliver", b, `¿Entregar el pedido <b>${esc(o.n)}</b> a ${esc(o.cliente)}? Ya está pagado.`, "Sí, entregar");
          if (!ok) return;
          await act("entregar", { pedido: o.n }, `✓ Pedido ${o.n} entregado`); return;
        }
        if (a === "sel") {
          if (o.kind === "web" && o.total > 3000000) { toast("Ese monto parece mal cotizado: corregí la cotización antes de cobrar", true); fix.style.display = ""; return; }
          const ok = await askConfirm("pay", b, o.kind === "saldo" ? `¿Cobrar el saldo de <b>${money(o.total)}</b> a ${esc(o.cliente)} con <b>${PAYLBL[m]}</b> y entregar?` : `¿Cobrar <b>${money(o.total)}</b> a ${esc(o.cliente)} con <b>${PAYLBL[m]}</b> y entregar el pedido?`, `Sí, cobrar ${money(o.total)} y entregar`);
          if (!ok) return;
          if (o.kind === "saldo") await act("cobrar_saldo", { comprobante: o.n, medio: m }, `✓ Saldo ${o.n} cobrado (${PAYLBL[m]} · ${money(o.total)})`);
          else await act("cobrar_web", { pedido: o.n, medio: m }, `✓ Pedido ${o.n} cobrado y entregado (${PAYLBL[m]} · ${money(o.total)})`);
        }
      };
    });
  }
  $("q").oninput = renderOrders;

  // ---------- COBROS DE HOY ----------
  function renderCobros() {
    const cobros = (st.data.cobros || []).slice().reverse();
    $("ncobros").textContent = cobros.length;
    const by = { Efectivo: 0, "Mercado Pago": 0, Banco: 0 };
    cobros.forEach((c) => { if (by[c.caja] != null) by[c.caja] += c.monto; });
    const tot = cobros.reduce((a, c) => a + c.monto, 0);
    $("kpis").innerHTML = [["Efectivo", by.Efectivo], ["Mercado Pago", by["Mercado Pago"]], ["Banco", by.Banco], ["Total del día · " + cobros.length + " movimientos", tot]].map((k) => `<div class="kpi"><span>${k[0]}</span><b>${money(k[1])}</b></div>`).join("");
    $("tb").innerHTML = cobros.length ? cobros.map((c) => `<tr><td>${esc(c.hora)}</td><td>${esc(c.origen)}${c.pedido ? " #" + esc(c.pedido) : c.comprobante ? " " + esc(c.comprobante) : ""}</td><td>${esc(c.detalle)}</td><td>${esc(c.cliente)}</td><td>${esc(c.medio)}</td><td>${esc(c.usuario)}</td><td class="r ${c.monto < 0 ? "neg" : ""}"><b>${money(c.monto)}</b></td><td>${c.medio === "Mercado Pago web" ? "" : `<button class="linkbtn" data-cm="${c.fila}">Cambiar medio</button>`}</td></tr><tr class="cmrow" data-cmrow="${c.fila}" style="display:none"><td colspan="8"></td></tr>`).join("") : '<tr><td colspan="8" class="hint">Todavía no hay cobros hoy</td></tr>';
    $("tb").querySelectorAll("[data-cm]").forEach((btn) => {
      btn.onclick = () => {
        const c = cobros.find((x) => String(x.fila) === btn.dataset.cm); if (!c) return;
        const row = $("tb").querySelector(`[data-cmrow="${c.fila}"]`); const cell = row.firstElementChild;
        if (row.style.display !== "none") { row.style.display = "none"; return; }
        const opts = PAYOPTS.filter(([m]) => PAYLBL[m] !== c.medio);
        cell.innerHTML = `<div class="cmbox"><span>Cambiar <b>${money(c.monto)}</b> de <b>${esc(c.medio)}</b> a:</span> <div class="seg pay">${opts.map(([m, l]) => `<button data-nm="${m}">${l}</button>`).join("")}</div> <button class="btn" data-x="1">Cancelar</button></div>`;
        row.style.display = "";
        cell.querySelector("[data-x]").onclick = () => { row.style.display = "none"; };
        cell.querySelectorAll("[data-nm]").forEach((nb) => {
          nb.onclick = async () => {
            const m = nb.dataset.nm;
            cell.querySelectorAll("[data-nm]").forEach((x) => { x.disabled = true; });
            await act("cambiar_medio", { fila: c.fila, hora: c.hora, ref: c.pedido || c.comprobante, medio: m }, `✓ Cobro de ${money(c.monto)} pasado a ${PAYLBL[m]}`);
          };
        });
      };
    });
  }

  // ---------- pestañas, reloj y arranque ----------
  document.querySelectorAll("nav button").forEach((b) => {
    b.onclick = () => { document.querySelectorAll("nav button,.tab").forEach((x) => x.classList.remove("on")); b.classList.add("on"); $(b.dataset.tab).classList.add("on"); };
  });
  setInterval(() => { $("clock").textContent = hhmm(); }, 1000); $("clock").textContent = hhmm();
  // se actualiza solo cada minuto (si la pestaña está abierta y no hay nada guardándose)
  setInterval(() => { if (st.sesion && busyCount === 0 && document.visibilityState === "visible") load(true); }, 60000);

  loadPrices();
  try {
    const saved = JSON.parse(localStorage.getItem("most_sesion") || "null");
    if (saved && saved.s) { st.sesion = saved.s; st.user = saved.u; start(); }
  } catch (x) { /* sin sesión guardada */ }
})();
