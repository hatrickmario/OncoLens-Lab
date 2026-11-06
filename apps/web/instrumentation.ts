// Hook de arranque de Next. `register()` corre una vez por proceso del servidor, antes de atender peticiones.
export async function register(): Promise<void> {
  // Solo el runtime Node tiene `http.Server`; en `edge` este módulo no se carga.
  if (process.env['NEXT_RUNTIME'] !== 'nodejs') return;
  // Falla el arranque si WEB_CSP_MODO es inválida o `solo_informe` en producción (US-216 AC-1, RN-22).
  const { leerModoCsp } = await import('./lib/server/csp');
  leerModoCsp(process.env);
  const { fijarIpDelSocket } = await import('./lib/server/fijar-ip-del-socket');
  fijarIpDelSocket();
}
