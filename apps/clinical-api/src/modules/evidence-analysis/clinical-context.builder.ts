import type { CasoClinico } from './evidence-analysis.repository.js';
import type { ContextoPermitido, MapaDeDataRefs } from './ports.js';

/** Meses completos entre una fecha `AAAA-MM-DD` y `ahora`; `null` si la fecha es `null` (nunca negativo). */
export function mesesTranscurridos(_fecha: string | null, _ahora: Date): number | null {
  throw new Error('no implementado');
}

/**
 * Allowlist del contexto clínico (RN-10): arma cada objeto campo a campo desde las filas leídas, nunca copiando
 * entidades completas. Devuelve además qué dato respalda cada `dataRef`.
 */
export function construirContextoPermitido(
  _caso: CasoClinico,
  _ahora: Date,
): { contexto: ContextoPermitido; dataRefs: MapaDeDataRefs } {
  throw new Error('no implementado');
}
