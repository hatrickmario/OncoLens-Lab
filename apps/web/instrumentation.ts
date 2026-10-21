// Hook de arranque de Next. `register()` corre una vez por proceso del servidor, antes de atender peticiones.
export async function register(): Promise<void> {
  // Solo el runtime Node tiene `http.Server`; en `edge` este módulo no se carga.
  if (process.env['NEXT_RUNTIME'] !== 'nodejs') return;
  const { fijarIpDelSocket } = await import('./lib/server/fijar-ip-del-socket');
  fijarIpDelSocket();
}
