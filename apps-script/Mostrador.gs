// ============================================================
// 29 BIS - MOSTRADOR (cotizador.29bis.com.ar/mostrador)
//
// Qué hace:
//  - Cada persona del equipo entra con su contraseña (pestaña oculta "equipo").
//  - Producción: lista los pedidos y permite cambiar el estado. Cuando pasa a
//    "Listo para retirar" o "Ver email" se disparan LOS MISMOS avisos que hoy
//    (mail por Brevo + WhatsApp por Make), igual que si lo cambiaran a mano.
//  - Entregar pedidos: cobrar y entregar pedidos web, o entregar los ya pagados.
//  - Corregir cotización de pedidos web (con cobro extra o devolución si ya estaba pagado).
//  - Trabajos presenciales, señas y saldos.
//  - Cambiar el medio de pago de un cobro de hoy (si el cliente cambió de idea).
//  - Pagar con dos medios (ej: una parte en efectivo y otra con QR).
//  - Marcar pedidos como "No retirado" (y volver a activarlos si el cliente aparece).
//  - Todo cobro queda en la pestaña "cobros"; cada acción queda en "registro".
//
// Instalación (una sola vez): ejecutar mostradorPreparar() desde el editor.
// En Código.gs, dentro de doPost, hay que sumar UNA línea (ver guía).
// ============================================================

const MOST_TZ = 'America/Argentina/Buenos_Aires';
const MOST_EQUIPO = 'equipo';
const MOST_COBROS = 'cobros';
const MOST_SALDOS = 'saldos';
const MOST_REGISTRO = 'registro';
const MOST_HORAS_SESION = 14;
const MOST_NO_RETIRADO = 'No retirado';
const MOST_DIAS_NO_RETIRADOS = 45; // cuántos días se siguen mostrando en la página

const MOST_COBROS_HEADER = ['Fecha', 'Hora', 'Comprobante', 'Origen', 'Pedido', 'Detalle', 'Tipo trabajo',
  'Tipo cliente', 'Cliente', 'DNI', 'Medio', 'Caja', 'Monto', 'Atendió'];
const MOST_SALDOS_HEADER = ['Comprobante', 'Fecha', 'Cliente', 'DNI', 'Detalle', 'Total', 'Seña', 'Saldo',
  'Estado', 'Cobrado el', 'Medio saldo', 'Atendió seña', 'Atendió saldo', 'Tipo trabajo', 'Tipo cliente'];
const MOST_REGISTRO_HEADER = ['Fecha y hora', 'Usuario', 'Pedido', 'Acción', 'Detalle'];

const MOST_ESTADOS = ['En revisión', 'En preparación', 'Listo para retirar', 'Retirado', 'Cancelado',
  'Ver email', 'Presupuesto', 'Pendiente'];
const MOST_MEDIOS = {
  efectivo: { label: 'Efectivo', caja: 'Efectivo' },
  qr: { label: 'QR / tarjeta', caja: 'Mercado Pago' },
  mp: { label: 'Transferencia MP', caja: 'Mercado Pago' },
  mpweb: { label: 'Mercado Pago web', caja: 'Mercado Pago' },
  banco: { label: 'Transferencia banco', caja: 'Banco' }
};

// columnas de "operacion" (1-based), según OPERACION_29_SAFE.gs
const MOST_OP = { pedido: 1, estado: 2, pago: 3, total: 4, retiro: 5, cliente: 6, dni: 7, email: 8,
  telefono: 9, tipo: 10, papel: 11, tamano: 12, faz: 13, detalle: 16, obs: 19, formaPago: 21,
  urgente: 23, filaOrders: 24, servicios: 26 };
// columnas de "orders" (1-based)
const MOST_OR = { pedido: 2, total: 19, pago: 21, estado: 22, links: 27, payload: 31, asignado: 33, cambio: 34 };

// ------------------------------------------------------------
// Entrada: se llama desde doPost cuando body.mostrador === true
// ------------------------------------------------------------
function mostradorManejar_(body) {
  try {
    const accion = String(body.accion || '');
    if (accion === 'login') return jsonResponse(mostLogin_(body));

    const usuario = mostValidarSesion_(body.sesion);
    if (!usuario) return jsonResponse({ ok: false, sesion: false, message: 'Tu sesión venció. Volvé a entrar.' });

    let r;
    if (accion === 'datos') r = mostDatos_(usuario);
    else if (accion === 'estado') r = mostCambiarEstado_(usuario, body);
    else if (accion === 'cobrar_web') r = mostCobrarWeb_(usuario, body);
    else if (accion === 'entregar') r = mostEntregar_(usuario, body);
    else if (accion === 'corregir') r = mostCorregir_(usuario, body);
    else if (accion === 'presencial') r = mostPresencial_(usuario, body);
    else if (accion === 'cobrar_saldo') r = mostCobrarSaldo_(usuario, body);
    else if (accion === 'cambiar_medio') r = mostCambiarMedio_(usuario, body);
    else if (accion === 'no_retirado') r = mostNoRetirado_(usuario, body);
    else if (accion === 'reactivar') r = mostReactivar_(usuario, body);
    else r = { ok: false, message: 'Acción desconocida.' };
    return jsonResponse(r);
  } catch (err) {
    console.error('Mostrador falló: ' + err + '\n' + (err && err.stack));
    return jsonResponse({ ok: false, message: 'Error en el servidor: ' + err });
  }
}

// ------------------------------------------------------------
// Sesión
// ------------------------------------------------------------
function mostSecreto_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('MOST_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('MOST_SECRET', s);
  }
  return s;
}

function mostFirma_(texto) {
  return Utilities.computeHmacSha256Signature(texto, mostSecreto_())
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('').slice(0, 32);
}

function mostLogin_(body) {
  const clave = String(body.clave || '').trim();
  if (!clave) return { ok: false, message: 'Escribí tu contraseña.' };
  const hoja = mostHoja_(MOST_EQUIPO, ['Nombre', 'Contraseña', 'Activo']);
  const filas = hoja.getLastRow() > 1 ? hoja.getRange(2, 1, hoja.getLastRow() - 1, 3).getDisplayValues() : [];
  for (let i = 0; i < filas.length; i++) {
    const nombre = String(filas[i][0]).trim();
    const pass = String(filas[i][1]).trim();
    const activo = String(filas[i][2]).trim().toUpperCase();
    if (nombre && pass && pass === clave && (activo === 'SI' || activo === 'SÍ')) {
      const vence = Date.now() + MOST_HORAS_SESION * 3600 * 1000;
      // El nombre va codificado para que tildes y eñes no rompan la firma (ej: Sofía).
      const base = encodeURIComponent(nombre) + '|' + vence;
      mostRegistrar_(nombre, '', 'Entró al mostrador', '');
      return { ok: true, usuario: nombre, sesion: Utilities.base64EncodeWebSafe(base + '|' + mostFirma_(base)) };
    }
  }
  return { ok: false, message: 'Contraseña incorrecta.' };
}

function mostValidarSesion_(sesion) {
  try {
    const txt = Utilities.newBlob(Utilities.base64DecodeWebSafe(String(sesion || ''))).getDataAsString();
    const partes = txt.split('|');
    if (partes.length !== 3) return '';
    const base = partes[0] + '|' + partes[1];
    if (mostFirma_(base) !== partes[2]) return '';
    if (Number(partes[1]) < Date.now()) return '';
    const nombreSesion = decodeURIComponent(partes[0]);
    // si lo dieron de baja en "equipo", la sesión deja de valer
    const hoja = mostHoja_(MOST_EQUIPO, ['Nombre', 'Contraseña', 'Activo']);
    const filas = hoja.getLastRow() > 1 ? hoja.getRange(2, 1, hoja.getLastRow() - 1, 3).getDisplayValues() : [];
    const sigue = filas.some(function (f) {
      const a = String(f[2]).trim().toUpperCase();
      return String(f[0]).trim() === nombreSesion && (a === 'SI' || a === 'SÍ');
    });
    return sigue ? nombreSesion : '';
  } catch (x) {
    return '';
  }
}

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
function mostSS_() { return SpreadsheetApp.openById(SHEET_ID); }

function mostHoja_(nombre, encabezado) {
  const ss = mostSS_();
  let h = ss.getSheetByName(nombre);
  if (!h) {
    h = ss.insertSheet(nombre);
    h.getRange(1, 1, 1, encabezado.length).setValues([encabezado]).setFontWeight('bold')
      .setBackground('#2d2b29').setFontColor('#ffffff');
    h.setFrozenRows(1);
    h.hideSheet();
  }
  return h;
}

function mostAhora_() {
  const d = new Date();
  return {
    d: d,
    fecha: Utilities.formatDate(d, MOST_TZ, 'dd/MM/yyyy'),
    hora: Utilities.formatDate(d, MOST_TZ, 'HH:mm'),
    completa: Utilities.formatDate(d, MOST_TZ, 'dd/MM/yyyy HH:mm')
  };
}

// Días desde una fecha "dd/MM/yyyy HH:mm" (o 0 si no se puede leer).
function mostDiasDesde_(txt) {
  const m = String(txt || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return 0;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function mostNorm_(v) {
  return String(v === null || v === undefined ? '' : v).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

function mostRegistrar_(usuario, pedido, accion, detalle) {
  try {
    const h = mostHoja_(MOST_REGISTRO, MOST_REGISTRO_HEADER);
    h.appendRow([mostAhora_().completa, usuario, pedido, accion, detalle || '']);
  } catch (err) {
    console.error('No se pudo escribir el registro: ' + err);
  }
}

function mostCobro_(datos) {
  const ahora = mostAhora_();
  const medio = MOST_MEDIOS[datos.medio] || { label: datos.medio, caja: '' };
  const h = mostHoja_(MOST_COBROS, MOST_COBROS_HEADER);
  const fila = h.getLastRow() + 1;
  const rango = h.getRange(fila, 1, 1, MOST_COBROS_HEADER.length);
  // Todo como texto salvo el monto, para que la fecha no cambie de formato y la planilla diaria la encuentre.
  rango.setNumberFormat('@');
  h.getRange(fila, 13).setNumberFormat('#,##0');
  rango.setValues([[ahora.fecha, ahora.hora, datos.comprobante || '', datos.origen || '', String(datos.pedido || ''),
    datos.detalle || '', datos.tipoTrabajo || '', datos.tipoCliente || '', String(datos.cliente || ''), String(datos.dni || ''),
    medio.label, medio.caja, Math.round(Number(datos.monto) || 0), datos.usuario || '']]);
}

// Marca que llevan los cobros que son la 2ª parte de un pago dividido (no cuentan como trabajo nuevo).
const MOST_SEGUNDO_MEDIO = ' · 2° medio';

// Arma las partes del pago: un solo medio, o dos medios que suman el total.
// Devuelve { partes: [{medio, monto}] } o { error: 'mensaje' }.
function mostPartesPago_(body, total) {
  const valido = function (m) { return MOST_MEDIOS[m] && m !== 'mpweb'; };
  if (Array.isArray(body.pagos) && body.pagos.length > 1) {
    if (body.pagos.length > 2) return { error: 'Se puede dividir en dos medios como máximo.' };
    const partes = body.pagos.map(function (x) { return { medio: String(x.medio || ''), monto: Math.round(Number(x.monto) || 0) }; });
    if (!partes.every(function (x) { return valido(x.medio); })) return { error: 'Elegí los dos medios de pago.' };
    if (partes[0].medio === partes[1].medio) return { error: 'Los dos medios de pago tienen que ser distintos.' };
    if (!partes.every(function (x) { return x.monto > 0; })) return { error: 'Cargá cuánto se paga con cada medio.' };
    if (partes[0].monto + partes[1].monto !== Math.round(total)) return { error: 'Los dos montos tienen que sumar $ ' + Math.round(total) + '.' };
    return { partes: partes };
  }
  const medio = String(body.medio || (Array.isArray(body.pagos) && body.pagos[0] ? body.pagos[0].medio : '') || '');
  if (!valido(medio)) return { error: 'Medio de pago no válido.' };
  return { partes: [{ medio: medio, monto: Math.round(total) }] };
}

// Escribe un cobro por cada parte (la 2ª lleva la marca para no contarse como otro trabajo).
function mostCobroPartes_(datos, partes) {
  partes.forEach(function (p, i) {
    mostCobro_(Object.assign({}, datos, { medio: p.medio, monto: p.monto,
      origen: i === 0 ? datos.origen : datos.origen + MOST_SEGUNDO_MEDIO }));
  });
}

function mostTextoPartes_(partes) {
  return partes.map(function (p) { return MOST_MEDIOS[p.medio].label + ' $ ' + p.monto; }).join(' + ');
}

function mostTipoTrabajoWeb_(tipoImpresion) {
  const t = mostNorm_(tipoImpresion);
  const l = t.indexOf('laser') !== -1, p = t.indexOf('plotter') !== -1;
  return l && p ? 'M' : l ? 'L' : p ? 'P' : '';
}

// Busca el pedido en "operacion" y en "orders". Devuelve { op, opFila, or, orFila, valores }.
function mostBuscarPedido_(pedido) {
  const ss = mostSS_();
  const op = ss.getSheetByName(OP_SHEET_NAME);
  const or = ss.getSheetByName(ORDERS_SHEET);
  const buscado = normalizarIdPedido_(pedido);
  const res = { op: op, or: or, opFila: 0, orFila: 0, valores: null };
  if (op && op.getLastRow() >= 2) {
    const n = op.getLastRow() - 1;
    const datos = op.getRange(2, 1, n, MOST_OP.servicios).getValues();
    for (let i = 0; i < n; i++) {
      if (normalizarIdPedido_(datos[i][0]) === buscado) {
        res.opFila = i + 2;
        res.valores = datos[i];
        break;
      }
    }
  }
  if (or && or.getLastRow() >= 2) {
    const ayuda = res.valores ? Number(res.valores[MOST_OP.filaOrders - 1] || 0) : 0;
    if (ayuda >= 2 && normalizarIdPedido_(String(or.getRange(ayuda, MOST_OR.pedido).getValue()).replace(/^29BIS-/i, '')) === buscado) {
      res.orFila = ayuda;
    } else {
      const ids = or.getRange(2, MOST_OR.pedido, or.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (normalizarIdPedido_(String(ids[i][0]).replace(/^29BIS-/i, '')) === buscado) { res.orFila = i + 2; break; }
      }
    }
  }
  return res;
}

// Escribe estado de pedido y/o de pago en las dos hojas, como lo hace hoy la edición a mano.
function mostEscribirEstados_(b, estadoPedido, estadoPago, usuario) {
  const ahora = mostAhora_();
  if (b.opFila) {
    if (estadoPedido) b.op.getRange(b.opFila, MOST_OP.estado).setValue(estadoPedido);
    if (estadoPago) b.op.getRange(b.opFila, MOST_OP.pago).setValue(estadoPago);
  }
  if (b.orFila) {
    b.or.getRange(b.orFila, MOST_OR.pago, 1, 2).clearDataValidations();
    if (estadoPago) b.or.getRange(b.orFila, MOST_OR.pago).setValue(estadoPago);
    if (estadoPedido) b.or.getRange(b.orFila, MOST_OR.estado).setValue(estadoPedido);
    b.or.getRange(b.orFila, MOST_OR.cambio).setValue(ahora.completa);
    if (usuario) b.or.getRange(b.orFila, MOST_OR.asignado).setValue(usuario);
  }
}

// Dispara los avisos al cliente igual que la edición a mano (mail Brevo + WhatsApp por Make).
function mostAvisarCliente_(b, estado) {
  if (!b.opFila) return;
  if (estado !== 'Listo para retirar' && estado !== 'Ver email') return;
  const orderNumber = String(b.op.getRange(b.opFila, MOST_OP.pedido).getValue() || '').trim();
  try {
    notificarCambioEstado_(b.op, b.opFila, orderNumber, estado);
  } catch (err) {
    console.error('Mostrador: falló el mail de aviso del pedido ' + orderNumber + ': ' + err);
  }
  try {
    avisarFilaAMake_(b.op, b.opFila);
  } catch (err) {
    console.error('Mostrador: falló el aviso a Make del pedido ' + orderNumber + ': ' + err);
  }
}

function mostConLock_(fn) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// Datos para la página
// ------------------------------------------------------------
function mostDatos_(usuario) {
  const ss = mostSS_();
  const op = ss.getSheetByName(OP_SHEET_NAME);
  const or = ss.getSheetByName(ORDERS_SHEET);
  const pedidos = [];

  // payload y links de "orders", por número de pedido
  const extras = {};
  if (or && or.getLastRow() >= 2) {
    const n = or.getLastRow() - 1;
    const ids = or.getRange(2, MOST_OR.pedido, n, 1).getValues();
    const links = or.getRange(2, MOST_OR.links, n, 1).getValues();
    const payloads = or.getRange(2, MOST_OR.payload, n, 1).getValues();
    const cambios = or.getRange(2, MOST_OR.cambio, n, 1).getDisplayValues();
    for (let i = 0; i < n; i++) {
      const id = normalizarIdPedido_(String(ids[i][0]).replace(/^29BIS-/i, ''));
      if (!id) continue;
      extras[id] = { link: buildAdjuntosUrl_(links[i][0]), payload: payloads[i][0], cambio: String(cambios[i][0] || '') };
    }
  }

  if (op && op.getLastRow() >= 2) {
    const n = op.getLastRow() - 1;
    const filas = op.getRange(2, 1, n, MOST_OP.servicios).getValues();
    for (let i = 0; i < n; i++) {
      const f = filas[i];
      const id = String(f[0] || '').trim();
      if (!id) continue;
      const estado = String(f[MOST_OP.estado - 1] || '').trim();
      const en = mostNorm_(estado);
      if (en === 'presupuesto') continue;
      // Los retirados solo se muestran si se entregaron hoy (para poder corregir algo).
      const exHoy = extras[normalizarIdPedido_(id)] || {};
      if (en === 'retirado' && String(exHoy.cambio).indexOf(mostAhora_().fecha) !== 0) continue;
      // Los "No retirado" se muestran un tiempo, por si el cliente aparece.
      if (en === 'no retirado' && mostDiasDesde_(exHoy.cambio) > MOST_DIAS_NO_RETIRADOS) continue;
      const retiroRaw = f[MOST_OP.retiro - 1];
      let retiro = '';
      if (retiroRaw instanceof Date && !isNaN(retiroRaw.getTime())) {
        retiro = Utilities.formatDate(retiroRaw, MOST_TZ, "yyyy-MM-dd'T'HH:mm");
      } else if (mostNorm_(retiroRaw) === 'sin apuro') {
        retiro = 'sin_apuro';
      }
      const ex = extras[normalizarIdPedido_(id)] || {};
      const payload = parseOrderPayload_(ex.payload);
      const trabajos = mostTrabajosDesdePayload_(payload);
      pedidos.push({
        n: id,
        estado: estado,
        pago: String(f[MOST_OP.pago - 1] || '').trim(),
        total: Number(f[MOST_OP.total - 1]) || 0,
        retiro: retiro,
        urgente: mostNorm_(f[MOST_OP.urgente - 1]) === 'si',
        cliente: String(f[MOST_OP.cliente - 1] || '').trim(),
        dni: String(f[MOST_OP.dni - 1] || '').trim(),
        tipo: String(f[MOST_OP.tipo - 1] || '').trim(),
        papel: String(f[MOST_OP.papel - 1] || '').trim(),
        tamano: String(f[MOST_OP.tamano - 1] || '').trim(),
        faz: String(f[MOST_OP.faz - 1] || '').trim(),
        detalle: String(f[MOST_OP.detalle - 1] || '').trim(),
        obs: String(f[MOST_OP.obs - 1] || '').trim().slice(0, 4000),
        formaPago: String(f[MOST_OP.formaPago - 1] || '').trim(),
        servicios: String(f[MOST_OP.servicios - 1] || '').trim(),
        link: ex.link || '',
        cambio: ex.cambio || '',
        trabajos: trabajos
      });
    }
  }

  // cobros de hoy
  const hoy = mostAhora_().fecha;
  const cobros = [];
  const hc = mostSS_().getSheetByName(MOST_COBROS);
  if (hc && hc.getLastRow() >= 2) {
    const n = hc.getLastRow() - 1;
    const desde = Math.max(0, n - 600); // alcanza de sobra para un día
    const filas = hc.getRange(2 + desde, 1, n - desde, MOST_COBROS_HEADER.length).getDisplayValues();
    const montos = hc.getRange(2 + desde, 13, n - desde, 1).getValues();
    filas.forEach(function (f, i) {
      if (f[0] !== hoy) return;
      cobros.push({ fila: 2 + desde + i, hora: f[1], comprobante: f[2], origen: f[3], pedido: f[4], detalle: f[5], cliente: f[8],
        medio: f[10], caja: f[11], monto: Number(montos[i][0]) || 0, usuario: f[13] });
    });
  }

  // saldos de señas pendientes
  const saldos = [];
  const hs = mostSS_().getSheetByName(MOST_SALDOS);
  if (hs && hs.getLastRow() >= 2) {
    const filas = hs.getRange(2, 1, hs.getLastRow() - 1, MOST_SALDOS_HEADER.length).getDisplayValues();
    const nums = hs.getRange(2, 6, hs.getLastRow() - 1, 3).getValues();
    filas.forEach(function (f, i) {
      if (mostNorm_(f[8]) !== 'pendiente') return;
      saldos.push({ comprobante: f[0], fecha: f[1], cliente: f[2], dni: f[3], detalle: f[4],
        total: Number(nums[i][0]) || 0, sena: Number(nums[i][1]) || 0, saldo: Number(nums[i][2]) || 0 });
    });
  }

  return { ok: true, usuario: usuario, ahora: mostAhora_().completa, pedidos: pedidos, cobros: cobros, saldos: saldos };
}

function mostTrabajosDesdePayload_(payload) {
  const items = Array.isArray(payload && payload.orderItems) ? payload.orderItems : [];
  return items.map(function (it, i) {
    const partes = [
      it.machine && it.machine.label,
      it.paper && it.paper.label,
      it.customSize && it.customSize.widthM ? (it.customSize.widthM + ' x ' + it.customSize.heightM + ' m') : (it.size && it.size.label),
      it.machine && it.machine.key === 'laser' && it.sides && it.sides.label ? it.sides.label : ''
    ].filter(Boolean);
    const servicios = (Array.isArray(it.services) ? it.services : [])
      .map(function (s) { return String((s && (s.detail || s.label)) || '').trim(); }).filter(Boolean).join('; ');
    const archivo = Array.isArray(payload.fileNames) && payload.fileNames.length > 1
      ? (payload.fileNames.filter(function (n) { return String(n).indexOf('Trabajo ' + (i + 1) + ' - ') === 0; })[0] || '')
      : '';
    return {
      maquina: it.machine && it.machine.key ? it.machine.key : '',
      detalle: partes.join(' · '),
      cantidad: formatWorkQuantityForOperacion_(it),
      servicios: servicios,
      archivo: archivo
    };
  });
}

// ------------------------------------------------------------
// Acciones
// ------------------------------------------------------------
function mostCambiarEstado_(usuario, body) {
  const estado = String(body.estado || '').trim();
  if (MOST_ESTADOS.indexOf(estado) === -1) return { ok: false, message: 'Estado no válido.' };
  return mostConLock_(function () {
    const b = mostBuscarPedido_(body.pedido);
    if (!b.opFila && !b.orFila) return { ok: false, message: 'No encontré el pedido ' + body.pedido + '.' };
    const antes = b.valores ? String(b.valores[MOST_OP.estado - 1] || '') : '';
    mostEscribirEstados_(b, estado, '', usuario);
    SpreadsheetApp.flush();
    mostAvisarCliente_(b, estado);
    mostRegistrar_(usuario, body.pedido, 'Cambio de estado', antes + ' → ' + estado);
    return { ok: true };
  });
}

function mostCobrarWeb_(usuario, body) {
  return mostConLock_(function () {
    const b = mostBuscarPedido_(body.pedido);
    if (!b.opFila) return { ok: false, message: 'No encontré el pedido ' + body.pedido + '.' };
    const v = b.valores;
    if (mostNorm_(v[MOST_OP.pago - 1]) === 'pagado') return { ok: false, message: 'Ese pedido ya figura como pagado. Actualizá la lista.' };
    const total = Number(v[MOST_OP.total - 1]) || 0;
    if (!(total > 0) || total > 3000000) return { ok: false, message: 'El total de ese pedido parece mal cotizado. Corregí la cotización antes de cobrar.' };
    const pp = mostPartesPago_(body, total);
    if (pp.error) return { ok: false, message: pp.error };
    mostEscribirEstados_(b, 'Retirado', 'Pagado', usuario);
    mostCobroPartes_({ origen: 'Web', pedido: String(v[0]), detalle: String(v[MOST_OP.detalle - 1] || v[MOST_OP.papel - 1] || ''),
      tipoTrabajo: mostTipoTrabajoWeb_(v[MOST_OP.tipo - 1]), cliente: v[MOST_OP.cliente - 1], dni: v[MOST_OP.dni - 1],
      usuario: usuario }, pp.partes);
    mostRegistrar_(usuario, body.pedido, 'Cobró y entregó', mostTextoPartes_(pp.partes));
    return { ok: true, monto: total };
  });
}

function mostEntregar_(usuario, body) {
  return mostConLock_(function () {
    const b = mostBuscarPedido_(body.pedido);
    if (!b.opFila) return { ok: false, message: 'No encontré el pedido ' + body.pedido + '.' };
    const v = b.valores;
    if (mostNorm_(v[MOST_OP.pago - 1]) !== 'pagado') return { ok: false, message: 'Ese pedido todavía no está pagado: cobralo antes de entregarlo.' };
    mostEscribirEstados_(b, 'Retirado', '', usuario);
    // El pago online entra a la caja del día en que se entrega (como "Mercado Pago web").
    const online = mostNorm_(v[MOST_OP.formaPago - 1]).indexOf('mercado pago') !== -1;
    if (online) {
      mostCobro_({ origen: 'Web (pagado online)', pedido: String(v[0]), detalle: String(v[MOST_OP.detalle - 1] || ''),
        tipoTrabajo: mostTipoTrabajoWeb_(v[MOST_OP.tipo - 1]), cliente: v[MOST_OP.cliente - 1], dni: v[MOST_OP.dni - 1],
        medio: 'mpweb', monto: Number(v[MOST_OP.total - 1]) || 0, usuario: usuario });
    }
    mostRegistrar_(usuario, body.pedido, 'Entregó (ya pagado)', String(v[MOST_OP.formaPago - 1] || ''));
    return { ok: true };
  });
}

function mostCorregir_(usuario, body) {
  const nuevo = Math.round(Number(body.monto) || 0);
  const motivo = String(body.motivo || '').trim();
  if (!(nuevo > 0) || !motivo) return { ok: false, message: 'Cargá el monto correcto y el motivo.' };
  return mostConLock_(function () {
    const b = mostBuscarPedido_(body.pedido);
    if (!b.opFila) return { ok: false, message: 'No encontré el pedido ' + body.pedido + '.' };
    const v = b.valores;
    const antes = Number(v[MOST_OP.total - 1]) || 0;
    const pagado = mostNorm_(v[MOST_OP.pago - 1]) === 'pagado';
    const dif = nuevo - antes;
    if (pagado) {
      const medio = String(body.medio || '');
      if (!MOST_MEDIOS[medio] || medio === 'mpweb') return { ok: false, message: 'Elegí con qué se cobra o se devuelve la diferencia.' };
      if (!dif) return { ok: false, message: 'No hay diferencia para registrar.' };
      mostCobro_({ origen: dif > 0 ? 'Cobro por corrección' : 'Devolución por corrección', pedido: String(v[0]),
        detalle: motivo, tipoTrabajo: mostTipoTrabajoWeb_(v[MOST_OP.tipo - 1]), cliente: v[MOST_OP.cliente - 1],
        dni: v[MOST_OP.dni - 1], medio: medio, monto: dif, usuario: usuario });
    }
    b.op.getRange(b.opFila, MOST_OP.total).setValue(nuevo);
    if (b.orFila) {
      const celda = b.or.getRange(b.orFila, MOST_OR.total);
      celda.setValue(nuevo);
      try { celda.setNote('Corregido por ' + usuario + ' el ' + mostAhora_().completa + ': $ ' + antes + ' → $ ' + nuevo + ' (' + motivo + ')'); } catch (x) { /* opcional */ }
    }
    mostRegistrar_(usuario, body.pedido, 'Corrigió cotización', '$ ' + antes + ' → $ ' + nuevo + ' · ' + motivo);
    return { ok: true, diferencia: dif };
  });
}

function mostSiguienteComprobante_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const n = Number(props.getProperty('MOST_COMPROBANTE') || 0) + 1;
    props.setProperty('MOST_COMPROBANTE', String(n));
    return 'P-' + ('0000' + n).slice(-5);
  } finally {
    lock.releaseLock();
  }
}

function mostPresencial_(usuario, body) {
  const total = Math.round(Number(body.total) || 0);
  if (!(total > 0)) return { ok: false, message: 'El ticket está vacío.' };
  const sena0 = Math.round(Number(body.sena) || 0);
  const pp = mostPartesPago_(body, sena0 > 0 ? sena0 : total);
  if (pp.error) return { ok: false, message: pp.error };
  const cliente = String(body.cliente || '').trim() || 'Consumidor final';
  const dni = String(body.dni || '').trim();
  const detalle = String(body.detalle || '').trim().slice(0, 2000);
  const sena = Math.round(Number(body.sena) || 0);
  const comp = mostSiguienteComprobante_();
  const base = { comprobante: comp, detalle: detalle, tipoTrabajo: String(body.tipoTrabajo || ''),
    tipoCliente: String(body.tipoCliente || ''), cliente: cliente, dni: dni, usuario: usuario };
  if (sena > 0) {
    if (sena >= total) return { ok: false, message: 'La seña tiene que ser menor al total.' };
    mostCobroPartes_(Object.assign({}, base, { origen: 'Seña', detalle: 'Seña · ' + detalle }), pp.partes);
    const hs = mostHoja_(MOST_SALDOS, MOST_SALDOS_HEADER);
    hs.appendRow([comp, mostAhora_().completa, cliente, dni, detalle, total, sena, total - sena, 'Pendiente', '', '',
      usuario, '', base.tipoTrabajo, base.tipoCliente]);
    mostRegistrar_(usuario, comp, 'Seña presencial', '$ ' + sena + ' de $ ' + total + ' (' + mostTextoPartes_(pp.partes) + ')');
  } else {
    mostCobroPartes_(Object.assign({}, base, { origen: 'Presencial' }), pp.partes);
    mostRegistrar_(usuario, comp, 'Cobro presencial', mostTextoPartes_(pp.partes));
  }
  return { ok: true, comprobante: comp, hora: mostAhora_().hora };
}

function mostCobrarSaldo_(usuario, body) {
  return mostConLock_(function () {
    const hs = mostHoja_(MOST_SALDOS, MOST_SALDOS_HEADER);
    if (hs.getLastRow() < 2) return { ok: false, message: 'No encontré ese saldo.' };
    const filas = hs.getRange(2, 1, hs.getLastRow() - 1, MOST_SALDOS_HEADER.length).getValues();
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      if (String(f[0]) !== String(body.comprobante)) continue;
      if (mostNorm_(f[8]) !== 'pendiente') return { ok: false, message: 'Ese saldo ya estaba cobrado.' };
      const saldo = Number(f[7]) || 0;
      const pp = mostPartesPago_(body, saldo);
      if (pp.error) return { ok: false, message: pp.error };
      const fila = i + 2;
      hs.getRange(fila, 9, 1, 3).setValues([['Cobrado', mostAhora_().completa, pp.partes.map(function (p) { return MOST_MEDIOS[p.medio].label; }).join(' + ')]]);
      hs.getRange(fila, 13).setValue(usuario);
      mostCobroPartes_({ comprobante: f[0], origen: 'Saldo', detalle: 'Saldo · ' + f[4], tipoTrabajo: f[13], tipoCliente: f[14],
        cliente: f[2], dni: f[3], usuario: usuario }, pp.partes);
      mostRegistrar_(usuario, f[0], 'Cobró saldo', mostTextoPartes_(pp.partes));
      return { ok: true, monto: saldo };
    }
    return { ok: false, message: 'No encontré ese saldo.' };
  });
}

// Cambia el medio de pago de un cobro de HOY (antes del cierre de caja).
function mostCambiarMedio_(usuario, body) {
  const medio = String(body.medio || '');
  if (!MOST_MEDIOS[medio] || medio === 'mpweb') return { ok: false, message: 'Medio de pago no válido.' };
  const fila = Number(body.fila) || 0;
  return mostConLock_(function () {
    const h = mostHoja_(MOST_COBROS, MOST_COBROS_HEADER);
    if (fila < 2 || fila > h.getLastRow()) return { ok: false, message: 'No encontré ese cobro. Actualizá la página.' };
    const f = h.getRange(fila, 1, 1, MOST_COBROS_HEADER.length).getDisplayValues()[0];
    // controles: que sea el mismo cobro que vio la persona y que sea de hoy
    if (f[0] !== mostAhora_().fecha) return { ok: false, message: 'Solo se puede cambiar el medio de los cobros de hoy.' };
    if (f[1] !== String(body.hora || '') || String(f[4] || f[2]) !== String(body.ref || '')) return { ok: false, message: 'La lista cambió. Actualizá la página y probá de nuevo.' };
    if (f[10] === MOST_MEDIOS.mpweb.label) return { ok: false, message: 'Ese cobro se pagó online con Mercado Pago: no se puede cambiar.' };
    const nuevo = MOST_MEDIOS[medio];
    if (f[10] === nuevo.label) return { ok: false, message: 'Ya estaba registrado con ese medio.' };
    h.getRange(fila, 11, 1, 2).setValues([[nuevo.label, nuevo.caja]]);
    // si era el saldo de una seña, también en "saldos"
    if (f[3] === 'Saldo' && f[2]) {
      const hs = mostHoja_(MOST_SALDOS, MOST_SALDOS_HEADER);
      if (hs.getLastRow() >= 2) {
        const comps = hs.getRange(2, 1, hs.getLastRow() - 1, 1).getDisplayValues();
        for (let i = 0; i < comps.length; i++) {
          if (comps[i][0] === f[2]) { hs.getRange(i + 2, 11).setValue(nuevo.label); break; }
        }
      }
    }
    mostRegistrar_(usuario, f[4] || f[2], 'Cambió medio de pago', f[10] + ' → ' + nuevo.label + ' ($ ' + f[12] + ', cobro de las ' + f[1] + ')');
    return { ok: true };
  });
}

// El cliente nunca vino a buscar el pedido.
function mostNoRetirado_(usuario, body) {
  return mostConLock_(function () {
    const b = mostBuscarPedido_(body.pedido);
    if (!b.opFila) return { ok: false, message: 'No encontré el pedido ' + body.pedido + '.' };
    const v = b.valores;
    const antes = String(v[MOST_OP.estado - 1] || '');
    const en = mostNorm_(antes);
    if (en === 'retirado' || en === 'cancelado' || en === 'no retirado') return { ok: false, message: 'Ese pedido figura como ' + antes + '. Actualizá la página.' };
    mostEscribirEstados_(b, MOST_NO_RETIRADO, '', usuario);
    const pago = String(v[MOST_OP.pago - 1] || '');
    mostRegistrar_(usuario, body.pedido, 'Marcó no retirado', antes + ' → ' + MOST_NO_RETIRADO + ' · pago: ' + pago + ' · $ ' + (Number(v[MOST_OP.total - 1]) || 0));
    return { ok: true };
  });
}

// El cliente apareció después de marcarlo como no retirado: vuelve a "Listo para retirar" SIN avisarle de nuevo.
function mostReactivar_(usuario, body) {
  return mostConLock_(function () {
    const b = mostBuscarPedido_(body.pedido);
    if (!b.opFila) return { ok: false, message: 'No encontré el pedido ' + body.pedido + '.' };
    if (mostNorm_(b.valores[MOST_OP.estado - 1]) !== 'no retirado') return { ok: false, message: 'Ese pedido ya no figura como no retirado. Actualizá la página.' };
    mostEscribirEstados_(b, 'Listo para retirar', '', usuario);
    mostRegistrar_(usuario, body.pedido, 'Volvió a activar', MOST_NO_RETIRADO + ' → Listo para retirar');
    return { ok: true };
  });
}

// ------------------------------------------------------------
// Archivo automático (todas las noches): saca de "orders" los pedidos terminados
// y los pasa arriba de todo en "orders_archivo". Así la planilla y el mostrador no se ponen lentos.
//   - Retirado y Cancelado: después de MOST_ARCHIVO_DIAS días.
//   - No retirado: después de MOST_DIAS_NO_RETIRADOS días (mientras tanto se pueden reactivar).
// Primero copia al archivo y recién después borra de "orders": si algo se corta, a lo sumo queda repetido, nunca se pierde.
// ------------------------------------------------------------
const MOST_ARCHIVO_DIAS = 2;
const MOST_ARCHIVO_MAX = 300; // por vez, para no pasarse del tiempo de Google; lo que falte se archiva la noche siguiente

function mostradorArchivarTerminados() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  let movidos = 0;
  try {
    const ss = mostSS_();
    const or = ss.getSheetByName(ORDERS_SHEET);
    if (!or || or.getLastRow() < 2) return 'No hay pedidos.';
    const ancho = or.getLastColumn();
    const filas = or.getRange(2, 1, or.getLastRow() - 1, ancho).getValues();
    const cambios = or.getRange(2, MOST_OR.cambio, or.getLastRow() - 1, 1).getDisplayValues();
    const creados = or.getRange(2, 1, or.getLastRow() - 1, 1).getDisplayValues();
    const elegidas = [];
    for (let i = 0; i < filas.length && elegidas.length < MOST_ARCHIVO_MAX; i++) {
      const en = mostNorm_(filas[i][MOST_OR.estado - 1]);
      const limite = (en === 'retirado' || en === 'cancelado') ? MOST_ARCHIVO_DIAS : en === 'no retirado' ? MOST_DIAS_NO_RETIRADOS : -1;
      if (limite < 0) continue;
      // fecha del último cambio de estado; si no hay, la fecha del pedido
      const cuando = String(cambios[i][0] || '').trim() || String(creados[i][0] || '').trim();
      if (!/^\d{1,2}\/\d{1,2}\/\d{4}/.test(cuando)) continue;
      if (mostDiasDesde_(cuando) <= limite) continue;
      elegidas.push(i);
    }
    if (!elegidas.length) return 'No hay pedidos para archivar.';

    // 1) copiar al archivo, arriba de todo (los más nuevos primero)
    const archivo = getOrCreateArchiveFromOrders_(ss, or);
    const copia = elegidas.map(function (i) { return sanitizeRowForSheet_(filas[i]); }).reverse();
    archivo.insertRowsBefore(2, copia.length);
    const destino = archivo.getRange(2, 1, copia.length, ancho);
    destino.clearFormat();
    destino.setValues(copia);
    SpreadsheetApp.flush();

    // 2) borrar de "orders" de abajo hacia arriba, agrupando filas seguidas
    const nums = elegidas.map(function (i) { return i + 2; }).sort(function (a, b) { return b - a; });
    let k = 0;
    while (k < nums.length) {
      let fin = nums[k], ini = fin;
      while (k + 1 < nums.length && nums[k + 1] === ini - 1) { k++; ini = nums[k]; }
      or.deleteRows(ini, fin - ini + 1);
      k++;
    }
    movidos = elegidas.length;
  } finally {
    lock.releaseLock();
  }
  // 3) rehacer la hoja "operacion" sin esos pedidos
  try { refreshOperacionEditable(); } catch (err) { console.error('No se pudo actualizar operacion: ' + err); }
  mostRegistrar_('Automático', '', 'Archivó pedidos', movidos + ' pedido(s) pasados a orders_archivo');
  return 'Listo: ' + movidos + ' pedido(s) archivados.';
}

// Ejecutar UNA vez: deja programado el archivo automático todas las noches a las 3.
function mostradorActivarArchivoAutomatico() {
  const fn = 'mostradorArchivarTerminados';
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === fn) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(fn).timeBased().everyDays(1).atHour(3).inTimezone(MOST_TZ).create();
  return 'Listo: los pedidos terminados se archivan solos todas las noches a las 3.';
}

// ------------------------------------------------------------
// Para ejecutar a mano, UNA sola vez
// ------------------------------------------------------------
function mostradorPreparar() {
  const equipo = mostHoja_(MOST_EQUIPO, ['Nombre', 'Contraseña', 'Activo']);
  if (equipo.getLastRow() < 2) {
    equipo.getRange(2, 1, MOST_EQUIPO_INICIAL.length, 3).setValues(MOST_EQUIPO_INICIAL);
    equipo.getRange(2, 2, MOST_EQUIPO_INICIAL.length, 1).setNumberFormat('@');
  }
  const regla = SpreadsheetApp.newDataValidation().requireValueInList(['SI', 'NO'], true).build();
  equipo.getRange(2, 3, 50, 1).setDataValidation(regla);
  mostHoja_(MOST_COBROS, MOST_COBROS_HEADER);
  mostHoja_(MOST_SALDOS, MOST_SALDOS_HEADER);
  mostHoja_(MOST_REGISTRO, MOST_REGISTRO_HEADER);
  mostSecreto_();
  console.log('Listo: pestañas equipo, cobros, saldos y registro creadas (ocultas).');
}
