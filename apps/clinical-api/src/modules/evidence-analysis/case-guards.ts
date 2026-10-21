import type { CasoClinico } from './evidence-analysis.repository.js';
import type { TiposDeCancerHabilitados } from './ports.js';

/** El paciente no tiene diagnóstico activo: no hay tipo de cáncer con el que filtrar la evidencia ([S1 resp. 35]). */
export class TipoCancerNoRegistradoError extends Error {
  constructor() {
    super('El caso no tiene tipo de cáncer');
    this.name = 'TipoCancerNoRegistradoError';
  }
}

/** Corte previo a la IA: sin diagnóstico activo no se desidentifica, ni se llama a rag-orchestrator, ni se persiste. */
export function exigirTipoCancer(caso: Pick<CasoClinico, 'diagnosticoActivo'>): void {
  if (caso.diagnosticoActivo === null) throw new TipoCancerNoRegistradoError();
}

/** Alcance del análisis: el tipo de cáncer del diagnóstico activo está o no en `ENABLED_CANCER_TYPES` (RN-20). */
export type AlcanceDelCaso = 'habilitado' | 'tipo_no_habilitado';

/**
 * Corte de alcance previo a la IA: un tipo no habilitado NO es un error (responde `200 tipo_no_habilitado`), por eso
 * devuelve el resultado en vez de lanzar. Se evalúa tras `exigirTipoCancer()` y antes de construir el contexto.
 */
export function exigirTipoHabilitado(
  _caso: Pick<CasoClinico, 'diagnosticoActivo'>,
  _tipos: TiposDeCancerHabilitados,
): AlcanceDelCaso {
  throw new Error('no implementado');
}
