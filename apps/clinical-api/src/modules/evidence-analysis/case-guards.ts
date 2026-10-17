import type { CasoClinico } from './evidence-analysis.repository.js';

/** El paciente no tiene diagnóstico activo: no hay tipo de cáncer con el que filtrar la evidencia ([S1 resp. 35]). */
export class TipoCancerNoRegistradoError extends Error {
  constructor() {
    super('El caso no tiene tipo de cáncer');
    this.name = 'TipoCancerNoRegistradoError';
  }
}

/** Corte previo a la IA: sin diagnóstico activo no se desidentifica, ni se llama a rag-orchestrator, ni se persiste. */
export function exigirTipoCancer(_caso: Pick<CasoClinico, 'diagnosticoActivo'>): void {
  throw new Error('no implementado');
}
