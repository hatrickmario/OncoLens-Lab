import 'server-only';
import { isIP } from 'node:net';

const PREFIJO_IPV4_MAPEADA = '::ffff:';

/**
 * IP del cliente que web reenvía a clinical-api (US-044 D4b). Cuando el servidor corre con `instrumentation.ts`, el
 * `X-Forwarded-For` que llega aquí ya es un único valor: la dirección del socket, escrita por web antes de que Next
 * lea la cabecera (`fijar-ip-del-socket.ts`). Se toma el ÚLTIMO valor (el salto más cercano) y se valida su forma;
 * cualquier otra cosa se descarta y no se reenvía nada, nunca se inventa.
 */
export function ipDelCliente(cabeceras: Headers): string | undefined {
  const valores = (cabeceras.get('x-forwarded-for') ?? '').split(',');
  const ultimo = (valores[valores.length - 1] ?? '').trim().toLowerCase();
  const ip = ultimo.startsWith(PREFIJO_IPV4_MAPEADA)
    ? ultimo.slice(PREFIJO_IPV4_MAPEADA.length)
    : ultimo;
  return isIP(ip) === 0 ? undefined : ip;
}
