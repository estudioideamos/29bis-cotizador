(function () {
  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search || "");
    return params.get(name);
  }

  function safeText(value, fallback) {
    const text = String(value || "").trim();
    return text || fallback;
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
      localStorage.removeItem(id);
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
        <a class="btn btn-primary" href="./index.html">Volver al cotizador</a>
      </div>
    `;
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
    greeting.textContent = `Hola ${customerName}, recibimos tu pedido correctamente y ya está en producción.`;
    orderNumber.textContent = safeText(data.orderNumber, "-");

    summary.innerHTML = [
      row("Hojas totales", safeText(data.totalSheets, "0")),
      row("Total estimado", safeText(data.totalFormatted, "$ 0"), "accent"),
      row("Forma de pago", safeText(data.paymentLabel, "-")),
      row("Retiro", safeText(data.pickupLabel, "Sin fecha/hora (trabajo urgente)")),
      row("Archivos", safeText(data.filesSummary, "Sin detalle"))
    ].join("");

    const isTransferPayment = safeText(data.paymentKey, "") === "transferencia";
    if (transferNote) {
      if (isTransferPayment) {
        transferNote.classList.remove("hidden");
        transferNote.innerHTML = `
          <p class="confirmation-note-alias">ALIAS: 29bis.ploteos</p>
          <p>Para impactar el pago, enviar el comprobante de transferencia a <strong>pedidos@29bis.com.ar</strong> con el número de pedido.</p>
        `;
      } else {
        transferNote.classList.add("hidden");
        transferNote.innerHTML = "";
      }
    }

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

