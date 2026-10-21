import type { Clock } from './clock.js';
import type { RegistroDeIntentosPorIp } from '../modules/auth/auth.service.js';

export interface OpcionesDelRegistroEnMemoria {
  reloj: Clock;
  /** Fallos dentro de la ventana a partir de los cuales la IP queda bloqueada (`LOGIN_MAX_FAILED_ATTEMPTS`). */
  maxIntentos: number;
  /** Ventana deslizante y plazo de bloqueo (`LOGIN_LOCKOUT_MINUTES`). */
  ventanaMinutos: number;
}

export interface RegistroDeIntentosPorIpEnMemoria extends RegistroDeIntentosPorIp {
  /** Cuántas IP conservan fallos vigentes (observabilidad y pruebas del barrido); nunca expone las direcciones. */
  ipsRegistradas(): number;
}

const MILISEGUNDOS_POR_MINUTO = 60_000;
const PREFIJO_IPV4_MAPEADA = '::ffff:';

/** Una misma dirección IPv4 llega como `1.2.3.4` o `::ffff:1.2.3.4` según el socket: es la misma IP. */
function normalizarIp(ip: string): string {
  const minusculas = ip.trim().toLowerCase();
  return minusculas.startsWith(PREFIJO_IPV4_MAPEADA)
    ? minusculas.slice(PREFIJO_IPV4_MAPEADA.length)
    : minusculas;
}

/**
 * Registro de fallos de login por IP, solo en memoria (US-044 D4): ventana deslizante, mismo umbral y plazo que el
 * bloqueo por cuenta. Guarda como mucho los últimos `maxIntentos` instantes por IP y NUNCA escribe la dirección en
 * ningún log (NFR-11). Un reinicio lo vacía y no escala a varias réplicas: riesgo aceptado del MVP (una sola instancia).
 */
export function createRegistroDeIntentosPorIp(
  opciones: OpcionesDelRegistroEnMemoria,
): RegistroDeIntentosPorIpEnMemoria {
  const { reloj, maxIntentos } = opciones;
  const ventanaMs = opciones.ventanaMinutos * MILISEGUNDOS_POR_MINUTO;
  const fallosPorIp = new Map<string, number[]>();
  let ultimoBarrido = reloj.now().getTime();

  /** Un fallo cuenta mientras `instante > ahora − ventana`: al cumplirse la ventana exacta ya no cuenta. */
  const vigente = (instante: number, ahora: number) => instante > ahora - ventanaMs;

  function barrerVencidas(ahora: number): void {
    if (ahora - ultimoBarrido < ventanaMs) return;
    ultimoBarrido = ahora;
    for (const [ip, instantes] of fallosPorIp) {
      if (!vigente(instantes[instantes.length - 1] ?? 0, ahora)) fallosPorIp.delete(ip);
    }
  }

  return {
    estaBloqueada(ip) {
      const instantes = fallosPorIp.get(normalizarIp(ip));
      if (instantes === undefined || instantes.length < maxIntentos) return false;
      return vigente(instantes[instantes.length - maxIntentos] ?? 0, reloj.now().getTime());
    },
    registrarFallo(ip) {
      const ahora = reloj.now().getTime();
      barrerVencidas(ahora);
      const clave = normalizarIp(ip);
      const instantes = [...(fallosPorIp.get(clave) ?? []), ahora].slice(-maxIntentos);
      fallosPorIp.set(clave, instantes);
    },
    ipsRegistradas: () => fallosPorIp.size,
  };
}
