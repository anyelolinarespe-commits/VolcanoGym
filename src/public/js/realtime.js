// ══════════════════════════════════════════════════════════════════════════════
//  REALTIME (cliente) — recibe eventos push del servidor (pedidos web nuevos,
//  convertidos o cancelados) y refresca la pantalla de Verificación de Pagos
//  sin necesidad de que el admin recargue manualmente.
// ══════════════════════════════════════════════════════════════════════════════

(function () {
  const token = localStorage.getItem('token');
  if (!token || typeof io !== 'function') return;

  const socket = io({ auth: { token } });

  function vistaVerificacionActiva() {
    const v = document.getElementById('view-verificacion-pagos');
    return !!v && getComputedStyle(v).display !== 'none';
  }

  socket.on('nuevo-pedido-web', (data) => {
    if (typeof showToast === 'function')
      showToast(`Nuevo pedido web: ${data.codigo_pedido}`, 'info');
    if (vistaVerificacionActiva() && typeof pwCargarPendientes === 'function')
      pwCargarPendientes();
  });

  socket.on('pedido-web-convertido', () => {
    if (vistaVerificacionActiva() && typeof vpCargar === 'function')
      vpCargar(_vpPage);
  });

  socket.on('pedido-web-cancelado', () => {
    if (vistaVerificacionActiva() && typeof pwCargarPendientes === 'function')
      pwCargarPendientes();
  });
})();
