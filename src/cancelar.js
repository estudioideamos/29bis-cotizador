(function () {
  const TRACKING_URL = "https://seguimiento.29bis.com.ar/";
  const params = new URLSearchParams(window.location.search || "");
  const pedido = String(params.get("pedido") || "").replace(/^29BIS-/i, "");
  const token = params.get("t") || "";
  const api = (window.APP_CONFIG || {}).ordersWebhookUrl || "";

  const elTitle = document.getElementById("cancel-title");
  const elText = document.getElementById("cancel-text");
  const elPedido = document.getElementById("cancel-pedido");
  const elActions = document.getElementById("cancel-actions");
  elPedido.textContent = pedido || "-";

  function trackingBtn() {
    const href = pedido ? `${TRACKING_URL}?pedido=${encodeURIComponent(pedido)}` : TRACKING_URL;
    return `<a class="btn btn-secondary" href="${href}" target="_blank" rel="noopener noreferrer">Ver seguimiento</a>`;
  }

  const backBtn = '<a class="btn btn-primary" href="./index.html">Volver al cotizador</a>';

  function show(title, text, actionsHtml) {
    elTitle.textContent = title;
    elText.textContent = text;
    elActions.innerHTML = actionsHtml === undefined ? backBtn : actionsHtml;
  }

  function call(action) {
    const url = `${api}?action=${action}&pedido=${encodeURIComponent(pedido)}&t=${encodeURIComponent(token)}`;
    return fetch(url).then((r) => r.json());
  }

  function showError() {
    show("No pudimos procesar la cancelación", "Escribinos a pedidos@29bis.com.ar con el asunto CANCELACIÓN y el número de pedido, y lo resolvemos.");
  }

  function doCancel() {
    elActions.innerHTML = "";
    elText.textContent = "Cancelando tu pedido…";
    call("cancel_do")
      .then((res) => {
        if (!res || !res.ok) {
          showError();
          return;
        }
        if (res.resultado === "cancelado") {
          show(
            "Pedido cancelado",
            res.pagado
              ? "Cancelamos tu pedido. Como ya figuraba como pagado, nos vamos a comunicar con vos para coordinar la devolución."
              : "Cancelamos tu pedido. No hace falta que hagas nada más."
          );
        } else if (res.resultado === "ya_cancelado") {
          show("El pedido ya estaba cancelado", "No hace falta que hagas nada más.");
        } else {
          show("No se puede cancelar desde acá", "Tu pedido ya está en preparación. Escribinos a pedidos@29bis.com.ar con el asunto CANCELACIÓN y el número de pedido, y lo vemos.", trackingBtn() + backBtn);
        }
      })
      .catch(showError);
  }

  function ask(res) {
    elTitle.textContent = "¿Querés cancelar tu pedido?";
    elText.textContent = res.pagado
      ? "Estado actual: " + res.estado + ". Ya figura como pagado: si lo cancelás, nos vamos a comunicar con vos para coordinar la devolución."
      : "Estado actual: " + res.estado + ". Esta acción no se puede deshacer.";
    elActions.innerHTML = '<button type="button" class="btn btn-primary" id="cancel-confirm">Sí, cancelar mi pedido</button><a class="btn btn-secondary" href="./index.html">No, volver</a>';
    document.getElementById("cancel-confirm").addEventListener("click", doCancel);
  }

  if (!api || !pedido || !token) {
    show("Link no válido", "Este enlace no tiene los datos necesarios. Escribinos a pedidos@29bis.com.ar.");
    return;
  }

  call("cancel_info")
    .then((res) => {
      if (!res || !res.ok) {
        show("Link no válido", "No encontramos el pedido o el link no es correcto. Escribinos a pedidos@29bis.com.ar con el número de pedido.");
        return;
      }
      if (res.yaCancelado) {
        show("El pedido ya estaba cancelado", "No hace falta que hagas nada más.");
      } else if (!res.cancelable) {
        show("No se puede cancelar desde acá", "Tu pedido ya está en estado \"" + res.estado + "\". Escribinos a pedidos@29bis.com.ar con el asunto CANCELACIÓN y el número de pedido, y lo vemos.", trackingBtn() + backBtn);
      } else {
        ask(res);
      }
    })
    .catch(showError);
})();
