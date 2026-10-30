(function () {
    const TRACKING_URL = "https://seguimiento.29bis.com.ar/";
   
  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search || "");
    return params.get(name);
  }

  function safeText(value, fallback) {
    const text = String(value || "").trim();
    return text || fallback;
  }

  function normalizeOrderNumber(orderNumber) {
    return String(orderNumber || "").replace(/^29BIS-/i, "");
  }

  function loadConfirmationData() {
    const id = getQueryParam("id");
    if (!id) {
      return null;
    }

    const raw = localStorage.getItem(id);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function row(label, value, tone) {
    const toneClass = tone ? ` ${tone}` : "";
    return `<div class="row${toneClass}"><span>${label}</span><strong>${value}</strong></div>`;
  }

  function renderMissingState() {
    const card = document.getElementById("confirmation-card");
    if (!card) {
      return;
    }

    card.innerHTML = `
      <p class="confirmation-kicker">Confirmación de pedido</p>
      <h2>No encontramos el detalle</h2>
      <p class="muted">Este enlace de confirmación ya venció o no tiene datos asociados.</p>
      <div class="actions">
        <a class="btn btn-secondary" href="${TRACKING_URL}" target="_blank" rel="noopener noreferrer">Hace seguimiento en vivo</a>
        <a class="btn btn-primary" href="./index.html">Volver al cotizador</a>
      </div>
    `;
  }

  function getApiUrl() {
    const cfg = window.APP_CONFIG || {};
    return cfg.ordersWebhookUrl || "";
  }

  function renderMercadoPago(data, isMpPayment) {
    const box = document.getElementById("mp-pay");
    if (!box) {
      return;
    }
    if (!isMpPayment) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }
    box.classList.remove("hidden");
    const orderNumber = normalizeOrderNumber(data.orderNumber);

    function showButton(url) {
      box.innerHTML = `
        <p class="confirmation-note-alias">Pago online</p>
        <p>Podés pagar con tarjeta (1 pago), dinero en cuenta de Mercado Pago o QR. Cuando se acredite, tu pedido se marca como pagado automáticamente.</p>
        <p><a class="btn btn-primary" id="mp-pay-btn" href="${url}">Pagar ahora con Mercado Pago</a></p>
      `;
    }

    function showRetry(message) {
      box.innerHTML = `
        <p class="confirmation-note-alias">Pago online</p>
        <p>${message}</p>
        <p><button type="button" class="btn btn-primary" id="mp-retry-btn">Generar link de pago</button></p>
        <p>Si no funciona, escribinos a <strong>pedidos@29bis.com.ar</strong> con el número de pedido y lo resolvemos.</p>
      `;
      const btn = document.getElementById("mp-retry-btn");
      if (btn) {
        btn.addEventListener("click", requestLink);
      }
    }

    function requestLink() {
      const api = getApiUrl();
      if (!api || !data.paymentToken) {
        showRetry("No pudimos generar el link de pago desde esta pantalla.");
        return;
      }
      box.innerHTML = "<p>Generando link de pago…</p>";
      fetch(`${api}?action=mp_link&pedido=${encodeURIComponent(orderNumber)}&t=${encodeURIComponent(data.paymentToken)}`)
        .then((r) => r.json())
        .then((res) => {
          if (res && res.ok && res.url) {
            showButton(res.url);
          } else if (res && res.ok && res.estado === "pagado") {
            box.innerHTML = "<p class=\"confirmation-note-alias\">¡Pago acreditado!</p><p>Tu pedido ya figura como pagado.</p>";
          } else {
            showRetry("No pudimos generar el link de pago.");
          }
        })
        .catch(() => showRetry("No pudimos generar el link de pago."));
    }

    if (data.paymentUrl) {
      showButton(data.paymentUrl);
    } else if (data.paymentToken) {
      showRetry("Tu pedido quedó registrado, pero el link de pago no se generó todavía.");
    } else {
      showRetry("Tu pedido quedó registrado. Escribinos para coordinar el pago.");
    }
  }

  function renderConfirmation(data) {
    const greeting = document.getElementById("confirmation-greeting");
    const orderNumber = document.getElementById("order-number");
    const summary = document.getElementById("confirmation-summary");
    const mailStatus = document.getElementById("mail-status");
    const transferNote = document.getElementById("transfer-note");

    if (!greeting || !orderNumber || !summary || !mailStatus) {
      return;
    }

    const customerName = safeText(data.customerName, "Cliente");
    const isMpPayment = safeText(data.paymentKey, "") === "mercadopago";
    greeting.textContent = isMpPayment
      ? `Hola ${customerName}, recibimos tu pedido. Para que entre en producción, completá el pago con Mercado Pago.`
      : `Hola ${customerName}, recibimos tu pedido correctamente y ya está en producción.`;
    orderNumber.textContent = safeText(normalizeOrderNumber(data.orderNumber), "-");

    const isSinApuro = safeText(data.pickupMode, "") === "sin_apuro";
    const trackingLink = document.getElementById("tracking-link");
    const cleanOrderNumber = normalizeOrderNumber(data.orderNumber);
    if (trackingLink && cleanOrderNumber) {
      trackingLink.href = `${TRACKING_URL}?pedido=${encodeURIComponent(cleanOrderNumber)}`;
    }
    if (trackingLink && isSinApuro) {
      // Los pedidos "sin apuro" no entran en la fila de producción: no hay seguimiento en vivo.
      trackingLink.classList.add("hidden");
    }

    summary.innerHTML = [
      row("Hojas totales", safeText(data.totalSheets, "0")),
      row("Total", safeText(data.totalFormatted, "$ 0"), "accent"),
      row("Forma de pago", safeText(data.paymentLabel, "-")),
      row("Retiro", safeText(data.pickupLabel, "Sin fecha/hora (trabajo urgente)")),
      row("Archivos", safeText(data.filesSummary, "Sin detalle"))
    ].join("");

    const isTransferPayment = safeText(data.paymentKey, "") === "transferencia";
    const externalFilesByEmail = Boolean(data.externalFilesByEmail);
    if (transferNote) {
      const blocks = [];
      if (isTransferPayment) {
        blocks.push(`
          <div>
            <p class="confirmation-note-alias">ALIAS: 29bis.ploteos</p>
            <p>Para impactar el pago, enviar el comprobante de transferencia a <strong>pedidos@29bis.com.ar</strong> con el número de pedido.</p>
          </div>
        `);
      }
      if (isSinApuro) {
        blocks.push(`
          <div>
            <p class="confirmation-note-alias">Pedido sin apuro</p>
            <p>Producimos y entregamos en tandas, sin fecha fija. Te avisamos por WhatsApp o mail cuando esté listo.</p>
          </div>
        `);
      }
      if (externalFilesByEmail) {
        blocks.push(`
          <div>
            <p class="confirmation-note-alias">Archivos grandes enviados por fuera del cotizador</p>
            <p>Recordá enviar el link de Google Drive o WeTransfer a <strong>pedidos@29bis.com.ar</strong> indicando el número de pedido.</p>
          </div>
        `);
      }
      if (blocks.length) {
        transferNote.classList.remove("hidden");
        transferNote.innerHTML = blocks.join("");
      } else {
        transferNote.classList.add("hidden");
        transferNote.innerHTML = "";
      }
    }

    renderMercadoPago(data, isMpPayment);

    if (data.mailSent) {
      mailStatus.className = "status ok";
      mailStatus.textContent = "También te enviamos este resumen por email.";
    } else {
      mailStatus.className = "status error";
      const detail = safeText(data.mailError, "No pudimos enviar el email automático.");
      mailStatus.textContent = `Pedido registrado. ${detail}`;
    }
  }

  const data = loadConfirmationData();
  if (!data) {
    renderMissingState();
    return;
  }

  renderConfirmation(data);
})();
