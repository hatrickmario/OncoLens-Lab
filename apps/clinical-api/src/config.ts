const DEFAULT_PORT = 3000;

/** Puerto de escucha desde `PORT` (RN-22: configuración, no literal en el código de arranque). */
export function readPort(env: NodeJS.ProcessEnv): number {
  const raw = env['PORT'];
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un puerto TCP válido');
  }
  return port;
}
