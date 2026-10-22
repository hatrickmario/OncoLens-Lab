import type {
  RegistroDeIntentosPorIp,
  ReservaDeIntentoPorIp,
} from '../modules/auth/auth.service.js';
import type { Clock } from './clock.js';

export interface OpcionesDelRegistroEnMemoria {
  reloj: Clock;
  /** Intentos dentro de la ventana a partir de los cuales la IP queda bloqueada (`LOGIN_MAX_FAILED_ATTEMPTS`). */
  maxIntentos: number;
  /** Ventana deslizante y plazo de bloqueo (`LOGIN_LOCKOUT_MINUTES`). */
  ventanaMinutos: number;
}

export interface RegistroDeIntentosPorIpEnMemoria extends RegistroDeIntentosPorIp {
  /** Cuántas IP conservan intentos vigentes (observabilidad y pruebas del barrido); nunca expone las direcciones. */
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

interface Intento {
  readonly instante: number;
}

/**
 * Registro de intentos de login por IP, solo en memoria (US-044 D4): ventana deslizante, mismo umbral y plazo que el
 * bloqueo por cuenta. `reservar` comprueba el bloqueo y anota el intento en una sola operación síncrona, ANTES de
 * verificar la contraseña: las peticiones concurrentes de una IP no pueden evaluar más de `maxIntentos` conjeturas.
 * Un intento correcto se libera; uno fallido se queda anotado. NUNCA escribe la dirección en ningún log (NFR-11).
 * Un reinicio lo vacía y no escala a varias réplicas: riesgo aceptado del MVP (una sola instancia).
 */
export function createRegistroDeIntentosPorIp(
  opciones: OpcionesDelRegistroEnMemoria,
): RegistroDeIntentosPorIpEnMemoria {
  const { reloj, maxIntentos } = opciones;
  const ventanaMs = opciones.ventanaMinutos * MILISEGUNDOS_POR_MINUTO;
  const intentosPorIp = new Map<string, Intento[]>();
  let ultimoBarrido = reloj.now().getTime();

  /** Un intento cuenta mientras `instante > ahora − ventana`: al cumplirse la ventana exacta ya no cuenta. */
  const vigente = (intento: Intento, ahora: number) => intento.instante > ahora - ventanaMs;

  function barrerVencidas(ahora: number): void {
    if (ahora - ultimoBarrido < ventanaMs) return;
    ultimoBarrido = ahora;
    for (const [ip, intentos] of intentosPorIp) {
      if (!intentos.some((intento) => vigente(intento, ahora))) intentosPorIp.delete(ip);
    }
  }

  return {
    reservar(ip): ReservaDeIntentoPorIp | null {
      const ahora = reloj.now().getTime();
      barrerVencidas(ahora);
      const clave = normalizarIp(ip);
      const vigentes = (intentosPorIp.get(clave) ?? []).filter((intento) =>
        vigente(intento, ahora),
      );
      if (vigentes.length >= maxIntentos) {
        intentosPorIp.set(clave, vigentes);
        return null;
      }
      const intento: Intento = { instante: ahora };
      intentosPorIp.set(clave, [...vigentes, intento]);
      return {
        liberar() {
          const restantes = (intentosPorIp.get(clave) ?? []).filter((otro) => otro !== intento);
          if (restantes.length === 0) intentosPorIp.delete(clave);
          else intentosPorIp.set(clave, restantes);
        },
      };
    },
    ipsRegistradas: () => intentosPorIp.size,
  };
}
