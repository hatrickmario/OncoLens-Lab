import 'server-only';
import { isIP } from 'node:net';
import { CABECERA_IP_DEL_SOCKET, leerIpFirmada } from './cabecera-ip-del-socket';

const PREFIJO_IPV4_MAPEADA = '::ffff:';

/**
 * IP del cliente que web reenvía a clinical-api (US-044 D4b/D4c). Solo vale la que el wrapper de `instrumentation.ts`
 * escribió con la firma del proceso (`cabecera-ip-del-socket.ts`): el `X-Forwarded-For` del cliente no se lee nunca, y
 * una petición atendida antes de instalar el wrapper no trae firma y devuelve `undefined` (falla cerrado). Se valida la
 * forma de la IP y se normaliza la IPv4 mapeada; cualquier otra cosa devuelve `undefined`, nunca se inventa.
 */
export function ipDelCliente(cabeceras: Headers): string | undefined {
  const ip = (leerIpFirmada(cabeceras.get(CABECERA_IP_DEL_SOCKET)) ?? '').trim().toLowerCase();
  const normalizada = ip.startsWith(PREFIJO_IPV4_MAPEADA)
    ? ip.slice(PREFIJO_IPV4_MAPEADA.length)
    : ip;
  return isIP(normalizada) === 0 ? undefined : normalizada;
}
