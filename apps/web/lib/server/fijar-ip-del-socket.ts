import { Server, type IncomingMessage } from 'node:http';
import { CABECERA_IP_DEL_SOCKET, firmarIpDelSocket } from './cabecera-ip-del-socket';

/*
 * Sin `import 'server-only'` a propósito: este módulo lo carga `instrumentation.ts` en el arranque del servidor Node,
 * fuera del árbol de componentes, y solo toca `node:http`.
 */

const MARCA_INSTALADA = Symbol.for('oncolens.web.ip-del-socket');

type Emit = (this: Server, evento: string | symbol, ...argumentos: unknown[]) => boolean;
type EmitMarcado = Emit & { [MARCA_INSTALADA]?: true };

/**
 * Escribe la dirección del socket, firmada, en `CABECERA_IP_DEL_SOCKET`, pisando lo que el cliente envíe en esa
 * cabecera. `ipDelCliente()` solo acepta la cabecera firmada y nunca lee el `X-Forwarded-For`: una petición que Next
 * atendió antes de instalar este wrapper (cola de arranque) no produce IP, en vez de producir una falsificada.
 */
export function escribirIpDelSocket(peticion: IncomingMessage): void {
  const direccion = peticion.socket.remoteAddress;
  if (direccion === undefined) {
    delete peticion.headers[CABECERA_IP_DEL_SOCKET];
    return;
  }
  peticion.headers[CABECERA_IP_DEL_SOCKET] = firmarIpDelSocket(direccion);
}

/**
 * Envuelve el evento `request` de `http.Server` para que `escribirIpDelSocket` corra antes que cualquier oyente (el de
 * Next incluido). Idempotente: una segunda llamada, aunque el módulo se cargue dos veces, no envuelve otra vez
 * (la marca vive en el registro global de símbolos). Solo para el runtime `nodejs`; `instrumentation.ts` lo garantiza.
 *
 * Límite: con un proxy HTTPS delante (S6) la dirección del socket será la del proxy; entonces habrá que leer el salto
 * correcto de la cabecera que ese proxy escriba, y `TRUST_PROXY_HOPS` en clinical-api decide cuántos saltos valen.
 */
export function fijarIpDelSocket(): void {
  const actual = Server.prototype.emit as EmitMarcado;
  if (actual[MARCA_INSTALADA] === true) return;
  const envuelto: EmitMarcado = function (this: Server, evento, ...argumentos) {
    if (evento === 'request') escribirIpDelSocket(argumentos[0] as IncomingMessage);
    return actual.call(this, evento, ...argumentos);
  };
  envuelto[MARCA_INSTALADA] = true;
  Server.prototype.emit = envuelto as typeof Server.prototype.emit;
}
