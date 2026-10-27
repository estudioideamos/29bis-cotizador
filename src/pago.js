(function () {
  const TRACKING_URL = "https://seguimiento.29bis.com.ar/";
  const params = new URLSearchParams(window.location.search || "");
  const pedido = String(params.get("pedido") || "").replace(/^29BIS-/i, "");
  const token = params.get("t") || "";
  const paymentId = params.get("payment_id") || params.get("collection_id") || "";
  const api = (window.APP_CONFIG || {}).ordersWebhookUrl || "";

  const elTitle = document.getElementById("pago-title");
  const elText = document.getElementById("pago-text");
  const elPedido = document.getElementById("pago-pedido");
  const elActions = document.getElementById("pago-actions");
  elPedido.textContent = pedido || "-";

  function trackingBtn() {
    const href = pedido ? `${TRACKING_URL}?pedido=${encodeURIComponent(pedido)}` : TRACKING_URL;
    return `<a class="btn btn-secondary" href="${href}" target="_blank" rel="noopener noreferrer">Hacé seguimiento en vivo</a>`;
  }

  function show(title, text, actionsHtml) {
    elTitle.textContent = title;
    elText.textContent = text;
    elActions.innerHTML = actionsHtml || trackingBtn();
  }

  function showPaid() {
    show("¡Pago acreditado!", "Recibimos tu pago y tu pedido ya está en producción. Gracias.", trackingBtn() + '<a class="btn btn-primary" href="./index.html">Volver al cotizador</a>');
  }

  function showRetry(title, text) {
    show(title, text, '<button type="button" class="btn btn-primary" id="pago-retry">Volver a intentar el pago</button>' + trackingBtn());
    document.getElementById("pago-retry").addEventListener("click", retryPayment);
  }

  function retryPayment() {
    elText.textContent = "Generando un nuevo link de pago…";
    fetch(`${api}?action=mp_link&pedido=${encodeURIComponent(pedido)}&t=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((res) => {
        if (res && res.ok && res.url) {
          window.location.href = res.url;
        } else if (res && res.ok && res.estado === "pagado") {
          showPaid();
        } else {
          show("No pudimos generar el link", "Escribinos a pedidos@29bis.com.ar con tu número de pedido y lo resolvemos.");
        }
      })
      .catch(() => show("No pudimos generar el link", "Escribinos a pedidos@29bis.com.ar con tu número de pedido y lo resolvemos."));
  }

  function check(intento) {
    let url = `${api}?action=mp_check&pedido=${encodeURIComponent(pedido)}&t=${encodeURIComponent(token)}`;
    if (paymentId) {
      url += `&payment_id=${encodeURIComponent(paymentId)}`;
    }
    fetch(url)
      .then((r) => r.json())
      .then((res) => {
        if (!res || !res.ok) {
          show("No pudimos verificar el pago", "Si ya pagaste, quedate tranquilo: lo vamos a ver en nuestra cuenta. Ante cualquier duda escribinos a pedidos@29bis.com.ar.");
          return;
        }
        if (res.estado === "pagado") {
          showPaid();
        } else if (res.estado === "rechazado") {
          showRetry("El pago no se completó", "Mercado Pago no aprobó el pago. Podés volver a intentarlo con otro medio.");
        } else if (intento < 3) {
          setTimeout(() => check(intento + 1), 4000);
        } else {
          show("Pago en proceso", "Todavía no vemos el pago acreditado. Si ya pagaste, en unos minutos se marca solo; no hace falta que hagas nada más.");
        }
      })
      .catch(() => show("No pudimos verificar el pago", "Si ya pagaste, lo vamos a ver en nuestra cuenta. Ante cualquier duda escribinos a pedidos@29bis.com.ar."));
  }

  if (!api || !pedido || !token) {
    show("Link no válido", "Este enlace no tiene los datos necesarios. Escribinos a pedidos@29bis.com.ar.");
    return;
  }
  check(1);
})();
