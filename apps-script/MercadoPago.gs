// ============================================================
// MERCADO PAGO - PAGO ONLINE DEL PEDIDO (Checkout Pro)
//
// Qué hace:
//  1) Si el cliente elige "Pagar online con Mercado Pago", crea un link de
//     pago por el total del pedido y se lo manda por mail.
//  2) Cuando el cliente paga, Mercado Pago avisa. Este código le PREGUNTA a
//     Mercado Pago si el pago es real y si el monto coincide, y recién ahí
//     pone "Pagado" en la columna Estado pago.
//  3) Red de seguridad: cada 10 minutos revisa los pagos que no avisaron.
//
// La clave secreta de Mercado Pago (Access Token) NO va en este archivo:
// se guarda en "Propiedades de la secuencia de comandos" (ver instrucciones).
//
// Funciones para ejecutar a mano:
//   mpPrepararTodo()   -> prepara el secreto, el activador de 10 minutos y muestra la dirección de avisos
//   mpProbarCredencial() -> verifica que la clave de Mercado Pago funciona (no muestra la clave)
// ============================================================

const MP_COTIZADOR_URL = 'https://cotizador.29bis.com.ar';
const MP_ESTADO_PAGADO = 'Pagado';
const MP_DIAS_VALIDEZ_LINK = 7;
const MP_PREFIJO_PEDIDO = 'MP_PREF_';   // registro interno de links creados
const MP_PREFIJO_PAGO = 'MP_PAGO_';     // registro interno de pagos confirmados

function mpProps_() {
  return PropertiesService.getScriptProperties();
}

function mpToken_() {
  const t = String(mpProps_().getProperty('MP_ACCESS_TOKEN') || '').trim();
  if (!t) throw new Error('Falta MP_ACCESS_TOKEN en las propiedades del script.');
  return t;
}

function mpSecreto_() {
  const props = mpProps_();
  let s = props.getProperty('MP_WEBHOOK_SECRET');
  if (!s) {
    s = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('MP_WEBHOOK_SECRET', s);
  }
  return s;
}

function mpWebAppUrl_() {
  const manual = String(mpProps_().getProperty('MP_WEBAPP_URL') || '').trim();
  return manual || ScriptApp.getService().getUrl();
}

function mpTokenPedido_(pedido) {
  const bytes = Utilities.computeHmacSha256Signature('pago|' + pedido, mpSecreto_());
  return bytes.map(function (b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('').slice(0, 16);
}

// 159 / "159" / "29BIS-159" -> "00159". Los formatos con fecha quedan como están.
function mpNormPedido_(valor) {
  const t = String(valor === null || valor === undefined ? '' : valor).trim().replace(/^29BIS-/i, '');
  if (/^\d+$/.test(t)) return t.length >= 5 ? t : '00000'.slice(t.length) + t;
  return t;
}

function mpJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function mpEsc_(t) {
  return String(t === null || t === undefined ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mpMonto_(n) {
  return Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

function mpLlamar_(metodo, url, payload) {
  const opciones = {
    method: metodo,
    headers: { Authorization: 'Bearer ' + mpToken_() },
    contentType: 'application/json',
    muteHttpExceptions: true
  };
  if (payload) opciones.payload = JSON.stringify(payload);
  const resp = UrlFetchApp.fetch(url, opciones);
  const codigo = resp.getResponseCode();
  let datos = {};
  try { datos = JSON.parse(resp.getContentText() || '{}'); } catch (x) { datos = {}; }
  return { codigo: codigo, datos: datos };
}

function mpAvisarAdmin_(asunto, texto) {
  try {
    MailApp.sendEmail({ to: ADMIN_ORDER_EMAIL, subject: asunto, body: texto, name: '29 BIS' });
  } catch (err) {
    console.error('No se pudo avisar por mail al admin: ' + err);
  }
}

// El total que se cobra tiene que coincidir con la suma de los trabajos del pedido.
function mpTotalCoherente_(body) {
  try {
    const items = Array.isArray(body && body.orderItems) ? body.orderItems : [];
    const total = Number(body && body.pricing && body.pricing.total);
    if (!(total > 0)) return { ok: false, total: total };
    if (!items.length) return { ok: true, total: total };
    let suma = 0;
    items.forEach(function (it) {
      const p = it && it.pricing ? it.pricing : {};
      suma += Number(p.subtotal || 0) + Number(p.servicesTotal || 0);
    });
    const descuento = Number(body.pricing.discountAmount || 0);
    const esperado = suma - descuento;
    return { ok: Math.abs(esperado - total) <= 1, total: total, esperado: esperado };
  } catch (err) {
    return { ok: false, total: 0 };
  }
}

// ------------------------------------------------------------
// Crear el link de pago
// ------------------------------------------------------------
function mpCrearPreferencia_(body, pedido) {
  const email = String(body && body.customer && body.customer.email || '').trim();
  const chequeo = mpTotalCoherente_(body);
  if (!chequeo.ok) {
    throw new Error('El total del pedido no coincide con la suma de sus trabajos (' +
      chequeo.total + ' vs ' + chequeo.esperado + ').');
  }
  const total = Math.round(chequeo.total);
  const token = mpTokenPedido_(pedido);
  const volver = MP_COTIZADOR_URL + '/pago.html?pedido=' + encodeURIComponent(pedido) + '&t=' + token;
  const vence = new Date(Date.now() + MP_DIAS_VALIDEZ_LINK * 24 * 3600 * 1000);

  const preferencia = {
    items: [{
      id: 'pedido-' + pedido,
      title: 'Pedido 29 BIS ' + pedido,
      quantity: 1,
      currency_id: 'ARS',
      unit_price: total
    }],
    payer: email ? { email: email } : undefined,
    external_reference: pedido,
    notification_url: mpWebAppUrl_() + '?mp=1&s=' + mpSecreto_(),
    back_urls: { success: volver, pending: volver, failure: volver },
    auto_return: 'approved',
    binary_mode: true,
    statement_descriptor: '29BIS',
    payment_methods: {
      excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
      installments: 1
    },
    expires: true,
    expiration_date_to: Utilities.formatDate(vence, 'America/Argentina/Buenos_Aires', "yyyy-MM-dd'T'HH:mm:ss.000-03:00")
  };

  const r = mpLlamar_('post', 'https://api.mercadopago.com/checkout/preferences', preferencia);
  if (r.codigo < 200 || r.codigo >= 300 || !r.datos.init_point) {
    throw new Error('Mercado Pago respondió ' + r.codigo + ': ' + JSON.stringify(r.datos).slice(0, 300));
  }
  mpProps_().setProperty(MP_PREFIJO_PEDIDO + pedido, JSON.stringify({
    id: r.datos.id, total: total, t: Date.now()
  }));
  return { url: r.datos.init_point, token: token, total: total };
}

// Se llama desde doPost, con el pedido ya guardado. Devuelve { url, token } o null.
function mpCrearPagoSiCorresponde_(body, orderNumber) {
  try {
    const clave = String(body && body.payment && body.payment.key || '');
    if (clave !== 'mercadopago') return null;
    const pedido = mpNormPedido_(orderNumber);
    const link = mpCrearPreferencia_(body, pedido);
    mpEnviarMailPago_(body, pedido, link);
    return { url: link.url, token: link.token };
  } catch (err) {
    console.error('MP: no se pudo crear el link de pago: ' + err);
    mpAvisarAdmin_('Mercado Pago: no se pudo crear el link de pago del pedido ' + orderNumber,
      'El pedido se guardó, pero no se generó el link de pago. Detalle: ' + err +
      '\n\nEl cliente puede pagar en el local, o reintentar desde la página de confirmación.');
    return { url: '', token: '', error: String(err) };
  }
}

function mpEnviarMailPago_(body, pedido, link) {
  const email = String(body && body.customer && body.customer.email || '').trim();
  if (!email) return;
  const nombre = String(body && body.customer && body.customer.name || 'Cliente').trim();
  const asunto = '29 BIS - Pagá tu pedido ' + pedido + ' con Mercado Pago';
  const texto = [
    'Hola ' + nombre + ',', '',
    'Para pagar tu pedido ' + pedido + ' ($ ' + mpMonto_(link.total) + ') con Mercado Pago, entrá a este link:',
    link.url, '',
    'El link vence en ' + MP_DIAS_VALIDEZ_LINK + ' días. Si ya pagaste, ignorá este mail.', '',
    'Gracias por elegir 29 BIS.'
  ].join('\n');
  const html = [
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0;padding:24px;background:#f7f6f3;"><tr><td align="center">',
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="width:560px;max-width:560px;background:#ffffff;border:1px solid #ece7dd;">',
    '<tr><td style="padding:24px;">',
    '<p style="margin:0 0 12px 0;color:#1c1c1a;font-family:Arial,sans-serif;font-size:18px;">Hola <strong>' + mpEsc_(nombre) + '</strong>,</p>',
    '<p style="margin:0 0 16px 0;color:#3b3b38;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;">Podés pagar tu pedido <strong>' + mpEsc_(pedido) + '</strong> por <strong>$ ' + mpEsc_(mpMonto_(link.total)) + '</strong> con Mercado Pago (tarjeta, dinero en cuenta o QR).</p>',
    '<a href="' + mpEsc_(link.url) + '" target="_blank" style="display:inline-block;background:#009ee3;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:16px;font-weight:700;padding:12px 20px;border-radius:8px;">Pagar ahora con Mercado Pago</a>',
    '<p style="margin:16px 0 0 0;color:#6a6966;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;">El link vence en ' + MP_DIAS_VALIDEZ_LINK + ' días. Si ya pagaste, ignorá este mail.</p>',
    '</td></tr></table></td></tr></table>'
  ].join('');
  try {
    if (typeof enviarMailBrevo_ === 'function') {
      enviarMailBrevo_({ to: email, subject: asunto, body: texto, htmlBody: html, name: '29 BIS' });
    } else {
      MailApp.sendEmail({ to: email, subject: asunto, body: texto, htmlBody: html, name: '29 BIS' });
    }
  } catch (err) {
    console.error('MP: no se pudo enviar el mail de pago: ' + err);
  }
}

// ------------------------------------------------------------
// Marcar como pagado (solo después de confirmar con Mercado Pago)
// ------------------------------------------------------------
function mpBuscarColumna_(hoja, nombres, porDefecto) {
  try {
    const cab = hoja.getRange(1, 1, 1, Math.max(1, hoja.getLastColumn())).getValues()[0];
    for (let i = 0; i < cab.length; i++) {
      const h = String(cab[i] || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      if (nombres.indexOf(h) !== -1) return i + 1;
    }
  } catch (x) { /* usa el valor por defecto */ }
  return porDefecto;
}

function mpPonerPagadoEnHoja_(hoja, pedido, nota) {
  if (!hoja || hoja.getLastRow() < 2) return false;
  const colPedido = mpBuscarColumna_(hoja, ['n° pedido', 'n pedido', 'numero de pedido', 'n° de pedido'], hoja.getName() === 'operacion' ? 1 : 2);
  const colPago = mpBuscarColumna_(hoja, ['estado pago'], hoja.getName() === 'operacion' ? 3 : 21);
  const n = hoja.getLastRow() - 1;
  const ids = hoja.getRange(2, colPedido, n, 1).getDisplayValues();
  let toco = false;
  for (let i = 0; i < n; i++) {
    if (mpNormPedido_(ids[i][0]) === pedido) {
      const celda = hoja.getRange(i + 2, colPago);
      if (String(celda.getValue()).trim() !== MP_ESTADO_PAGADO) {
        celda.setValue(MP_ESTADO_PAGADO);
        if (hoja.getName() === 'orders') { try { celda.setNote(nota); } catch (x) { /* la nota es opcional */ }} 
      }
      toco = true;
    }
  }
  return toco;
}

// Si un pedido ya figura como pagado en el registro interno pero la hoja volvió a decir
// "Pendiente" (por ejemplo, porque la hoja operacion se rearmó justo en ese momento),
// lo vuelve a poner como pagado. Mira solo los pagos de los últimos 2 días.
function mpReaplicarPagados_() {
  const todo = mpProps_().getProperties();
  const limite = Date.now() - 2 * 24 * 3600 * 1000;
  const recientes = {};
  let hay = false;
  Object.keys(todo).forEach(function (k) {
    if (k.indexOf(MP_PREFIJO_PAGO) !== 0) return;
    let reg = {};
    try { reg = JSON.parse(todo[k]); } catch (x) { reg = {}; }
    if (reg.t && reg.t >= limite) { recientes[k.slice(MP_PREFIJO_PAGO.length)] = reg; hay = true; }
  });
  if (!hay) return;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ['orders', 'operacion'].forEach(function (nombre) {
    const hoja = ss.getSheetByName(nombre);
    if (!hoja || hoja.getLastRow() < 2) return;
    const colPedido = mpBuscarColumna_(hoja, ['n° pedido', 'n pedido', 'numero de pedido', 'n° de pedido'], nombre === 'operacion' ? 1 : 2);
    const colPago = mpBuscarColumna_(hoja, ['estado pago'], nombre === 'operacion' ? 3 : 21);
    const n = hoja.getLastRow() - 1;
    const ids = hoja.getRange(2, colPedido, n, 1).getDisplayValues();
    const estados = hoja.getRange(2, colPago, n, 1).getValues();
    for (let i = 0; i < n; i++) {
      const ped = mpNormPedido_(ids[i][0]);
      if (recientes[ped] && String(estados[i][0]).trim() !== MP_ESTADO_PAGADO) {
        hoja.getRange(i + 2, colPago).setValue(MP_ESTADO_PAGADO);
      }
    }
  });
}

function mpMarcarPagado_(pedido, pago) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = mpProps_();
    if (props.getProperty(MP_PREFIJO_PAGO + pedido)) return { yaEstaba: true };
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const fecha = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy HH:mm');
    const nota = 'Pagado por Mercado Pago · operación ' + pago.id + ' · $ ' + mpMonto_(pago.transaction_amount) + ' · ' + fecha;
    const enOrders = mpPonerPagadoEnHoja_(ss.getSheetByName('orders'), pedido, nota);
    const enOperacion = mpPonerPagadoEnHoja_(ss.getSheetByName('operacion'), pedido, nota);
    if (!enOrders && !enOperacion) {
      mpAvisarAdmin_('Mercado Pago: pago recibido de un pedido que no encuentro (' + pedido + ')',
        'Operación ' + pago.id + ' por $ ' + mpMonto_(pago.transaction_amount) +
        '. No encontré el pedido ' + pedido + ' en las hojas. Revisalo a mano.');
      return { noEncontrado: true };
    }
    props.setProperty(MP_PREFIJO_PAGO + pedido, JSON.stringify({ id: pago.id, monto: pago.transaction_amount, t: Date.now() }));
    return { marcado: true };
  } finally {
    lock.releaseLock();
  }
}

const MP_PREFIJO_AVISO = 'MP_AVISO_';   // avisos de "monto no coincide" ya enviados (para no repetirlos)

// Recibe un pago ya consultado a Mercado Pago (aviso de Mercado Pago o vuelta del cliente).
// No decide con ese pago solo: junta TODOS los pagos aprobados del pedido, porque el cliente
// puede pagar en partes (por ejemplo, con dos tarjetas).
function mpProcesarPago_(pago) {
  const pedido = mpNormPedido_(pago && pago.external_reference);
  if (!pedido) return { ok: false, estado: 'desconocido' };
  if (String(pago.status) !== 'approved') {
    return { ok: true, estado: String(pago.status || 'pendiente'), pedido: pedido };
  }
  return mpVerificarPedido_(pedido, String(pago.id || ''), pago);
}

// Suma los pagos aprobados del pedido y lo marca pagado si alcanzan el total.
function mpEvaluarAprobados_(pedido, aprobados) {
  const crudo = mpProps_().getProperty(MP_PREFIJO_PEDIDO + pedido);
  const ids = aprobados.map(function (p) { return String(p.id); });
  const suma = aprobados.reduce(function (acc, p) { return acc + (Number(p.transaction_amount) || 0); }, 0);
  if (!crudo) {
    mpAvisarUnaVez_(pedido, 'sin_registro|' + ids.join(','), 'Mercado Pago: pago de un pedido sin link registrado (' + pedido + ')',
      'Operación(es) ' + ids.join(' + ') + ' por $ ' + mpMonto_(suma) + '. Revisalo a mano.');
    return { ok: false, estado: 'sin_registro', pedido: pedido };
  }
  const esperado = Number(JSON.parse(crudo).total);
  if (suma + 1 < esperado) {
    // pago parcial: se avisa UNA sola vez por cada combinación de pagos (no cada 10 minutos)
    mpAvisarUnaVez_(pedido, ids.join(','), 'Mercado Pago: el monto pagado no coincide (pedido ' + pedido + ')',
      'Pagado hasta ahora: $ ' + mpMonto_(suma) + ' (' + aprobados.length + ' pago/s: ' + ids.join(' + ') + ')' +
      ' - Esperado: $ ' + mpMonto_(esperado) + '. Todavía NO se marcó como pagado. Si el cliente paga el resto, se marca solo.');
    return { ok: false, estado: 'monto_distinto', pedido: pedido };
  }
  mpMarcarPagado_(pedido, { id: ids.join(' + '), transaction_amount: suma });
  return { ok: true, estado: 'pagado', pedido: pedido };
}

function mpAvisarUnaVez_(pedido, clave, asunto, texto) {
  const props = mpProps_();
  if (props.getProperty(MP_PREFIJO_AVISO + pedido) === clave) return;
  props.setProperty(MP_PREFIJO_AVISO + pedido, clave);
  mpAvisarAdmin_(asunto, texto);
}

function mpConsultarPagoPorId_(idPago) {
  const r = mpLlamar_('get', 'https://api.mercadopago.com/v1/payments/' + encodeURIComponent(idPago));
  if (r.codigo !== 200) return null;
  return r.datos;
}

function mpBuscarPagosDePedido_(pedido) {
  const r = mpLlamar_('get', 'https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=30&external_reference=' + encodeURIComponent(pedido));
  if (r.codigo !== 200 || !Array.isArray(r.datos.results)) return [];
  return r.datos.results;
}

function mpVerificarPedido_(pedido, idPagoOpcional, pagoYaConsultado) {
  if (mpProps_().getProperty(MP_PREFIJO_PAGO + pedido)) return { ok: true, estado: 'pagado', pedido: pedido };
  const porId = {};
  const sumar = function (p) { if (p && p.id && mpNormPedido_(p.external_reference) === pedido) porId[String(p.id)] = p; };
  sumar(pagoYaConsultado);
  if (idPagoOpcional && !porId[idPagoOpcional]) sumar(mpConsultarPagoPorId_(idPagoOpcional));
  mpBuscarPagosDePedido_(pedido).forEach(sumar);
  const candidatos = Object.keys(porId).map(function (k) { return porId[k]; });
  const aprobados = candidatos.filter(function (p) { return String(p.status) === 'approved'; });
  if (aprobados.length) return mpEvaluarAprobados_(pedido, aprobados);
  if (candidatos.length) {
    const rechazado = candidatos.find(function (p) { return String(p.status) === 'rejected'; });
    return { ok: true, estado: rechazado ? 'rechazado' : 'pendiente', pedido: pedido };
  }
  return { ok: true, estado: 'pendiente', pedido: pedido };
}

// ------------------------------------------------------------
// Avisos de Mercado Pago (llegan por POST con ?mp=1&s=SECRETO)
// ------------------------------------------------------------
function mpManejarAviso_(e) {
  try {
    const s = String(e && e.parameter && e.parameter.s || '');
    if (!s || s !== mpSecreto_()) return mpJson_({ ok: false });
    let cuerpo = {};
    try { cuerpo = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (x) { cuerpo = {}; }
    const tipo = String(cuerpo.type || e.parameter.type || e.parameter.topic || '').toLowerCase();
    const idPago = (cuerpo.data && cuerpo.data.id) || e.parameter['data.id'] || e.parameter.id || '';
    if (tipo.indexOf('payment') === -1 || !idPago) return mpJson_({ ok: true });
    const pago = mpConsultarPagoPorId_(idPago);
    if (pago) mpProcesarPago_(pago);
    return mpJson_({ ok: true });
  } catch (err) {
    console.error('MP aviso falló: ' + err);
    return mpJson_({ ok: true });
  }
}

// ------------------------------------------------------------
// Pedidos del navegador (página de confirmación / página de pago)
//   ?action=mp_link&pedido=00201&t=TOKEN   -> genera de nuevo el link de pago
//   ?action=mp_check&pedido=00201&t=TOKEN&payment_id=123 -> verifica el pago
// ------------------------------------------------------------
function mpManejarGet_(e, accion) {
  try {
    const pedido = mpNormPedido_(e.parameter.pedido);
    const t = String(e.parameter.t || '');
    if (!pedido || !t || t !== mpTokenPedido_(pedido)) return mpJson_({ ok: false, message: 'Link no válido.' });

    if (accion === 'mp_check') {
      return mpJson_(mpVerificarPedido_(pedido, String(e.parameter.payment_id || e.parameter.collection_id || '')));
    }

    // mp_link
    if (mpProps_().getProperty(MP_PREFIJO_PAGO + pedido)) return mpJson_({ ok: true, estado: 'pagado' });
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const body = mpLeerPedidoGuardado_(ss, pedido);
    if (!body) return mpJson_({ ok: false, message: 'No encontré el pedido.' });
    const link = mpCrearPreferencia_(body, pedido);
    return mpJson_({ ok: true, url: link.url });
  } catch (err) {
    console.error('MP GET falló: ' + err);
    return mpJson_({ ok: false, message: 'No se pudo completar la operación.' });
  }
}

function mpLeerPedidoGuardado_(ss, pedido) {
  const hoja = ss.getSheetByName('orders');
  if (!hoja || hoja.getLastRow() < 2) return null;
  const colPedido = mpBuscarColumna_(hoja, ['n° pedido', 'n pedido', 'numero de pedido'], 2);
  const colPayload = mpBuscarColumna_(hoja, ['payload crudo'], 31);
  const n = hoja.getLastRow() - 1;
  const ids = hoja.getRange(2, colPedido, n, 1).getDisplayValues();
  for (let i = n - 1; i >= 0; i--) {
    if (mpNormPedido_(ids[i][0]) === pedido) {
      const crudo = hoja.getRange(i + 2, colPayload).getValue();
      try { return JSON.parse(String(crudo)); } catch (x) { return null; }
    }
  }
  return null;
}

// ------------------------------------------------------------
// Red de seguridad: cada 10 minutos revisa los links de los últimos días
// ------------------------------------------------------------
function mpRevisarPendientes() {
  try {
    const props = mpProps_();
    const todo = props.getProperties();
    const limite = Date.now() - 14 * 24 * 3600 * 1000;
    let revisados = 0;
    Object.keys(todo).forEach(function (k) {
      if (k.indexOf(MP_PREFIJO_PEDIDO) !== 0) return;
      const pedido = k.slice(MP_PREFIJO_PEDIDO.length);
      let reg = {};
      try { reg = JSON.parse(todo[k]); } catch (x) { reg = {}; }
      if (!reg.t || reg.t < limite) { props.deleteProperty(k); props.deleteProperty(MP_PREFIJO_AVISO + pedido); return; }
      if (todo[MP_PREFIJO_PAGO + pedido]) return;
      if (revisados >= 40) return;
      revisados++;
      mpVerificarPedido_(pedido, '');
    });
    mpReaplicarPagados_();
  } catch (err) {
    console.error('mpRevisarPendientes falló: ' + err);
  }
}

// ------------------------------------------------------------
// Para ejecutar a mano
// ------------------------------------------------------------
function mpPrepararTodo() {
  mpSecreto_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'mpRevisarPendientes') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('mpRevisarPendientes').timeBased().everyMinutes(10).create();
  console.log('Listo. Activador de 10 minutos creado.');
  console.log('Dirección de la aplicación web: ' + mpWebAppUrl_());
  if (!mpProps_().getProperty('MP_ACCESS_TOKEN')) {
    console.log('FALTA cargar MP_ACCESS_TOKEN en las propiedades de la secuencia de comandos.');
  }
}

function mpProbarCredencial() {
  const r = mpLlamar_('get', 'https://api.mercadopago.com/users/me');
  if (r.codigo === 200) {
    console.log('La clave funciona. Cuenta: ' + (r.datos.nickname || r.datos.email || r.datos.id));
  } else {
    console.log('La clave NO funciona (código ' + r.codigo + '). Revisá que esté bien copiada.');
  }
}

function mpLimpiarNotasOperacion() {
     const hoja = SpreadsheetApp.openById(SHEET_ID).getSheetByName('operacion');
     if (!hoja || hoja.getLastRow() < 2) return;
     const col = mpBuscarColumna_(hoja, ['estado pago'], 3);
     hoja.getRange(2, col, hoja.getLastRow() - 1, 1).clearNote();
}

