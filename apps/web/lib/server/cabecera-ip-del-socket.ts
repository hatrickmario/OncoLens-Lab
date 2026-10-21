import { randomUUID } from 'node:crypto';

/*
 * Sin `import 'server-only'` a propósito: lo cargan `instrumentation.ts` (arranque del servidor Node, fuera del árbol de
 * componentes) y el Route Handler; solo toca `node:crypto`.
 */

/**
 * Cabecera interna con la IP del socket, firmada con un secreto de proceso. Falla cerrado (US-044 D4b/D4c): como el
 * secreto es aleatorio por proceso y nunca sale de él, un cliente no puede fabricar un valor válido, y una petición que
 * Next atendió antes de que el wrapper estuviera instalado llega sin firma y no produce IP.
 */
export const CABECERA_IP_DEL_SOCKET = 'x-oncolens-ip-del-socket';

const CLAVE_DEL_SECRETO = Symbol.for('oncolens.web.secreto-ip-del-socket');

/** El secreto vive en el registro global de símbolos: el wrapper de `instrumentation.ts` y el Route Handler lo comparten. */
function secretoDelProceso(): string {
  const global = globalThis as { [CLAVE_DEL_SECRETO]?: string };
  global[CLAVE_DEL_SECRETO] ??= randomUUID();
  return global[CLAVE_DEL_SECRETO];
}

export function firmarIpDelSocket(ip: string): string {
  return `${secretoDelProceso()}|${ip}`;
}

/** La IP de una cabecera firmada por este proceso; `undefined` si falta o la firma no es la del proceso. */
export function leerIpFirmada(valor: string | null): string | undefined {
  if (valor === null) return undefined;
  const separador = valor.indexOf('|');
  if (separador < 0 || valor.slice(0, separador) !== secretoDelProceso()) return undefined;
  return valor.slice(separador + 1);
}
