import type { RequestHandler, Router } from 'express';

/** De dónde sale el paciente de una ruta `generaIA`: del cuerpo, del análisis de la ruta o de la conversación de la ruta. */
export type FuenteDelPaciente = 'cuerpo' | 'analisis' | 'conversacion';

export interface RutaGeneraIA {
  readonly operationId: string;
  readonly metodo: 'post';
  /** Ruta relativa al router que se monta bajo `/platform`, con parámetros `:x` como en Express. */
  readonly ruta: string;
  readonly origenDelPaciente: FuenteDelPaciente;
}

/**
 * Lista cerrada de las operaciones que generan con IA (DEC-22). Es legal, no calibrable (RN-22 no aplica): añadir una
 * ruta con `x-genera-ia` al contrato sin añadirla aquí y sin guardia hace fallar el test de cobertura.
 */
export const RUTAS_GENERA_IA = [
  {
    operationId: 'createEvidenceAnalysis',
    metodo: 'post',
    ruta: '/evidence-analyses',
    origenDelPaciente: 'cuerpo',
  },
  {
    operationId: 'createFollowUp',
    metodo: 'post',
    ruta: '/evidence-analyses/:analysisId/follow-ups',
    origenDelPaciente: 'analisis',
  },
  {
    operationId: 'createConversationTurn',
    metodo: 'post',
    ruta: '/conversations/:conversationId/turns',
    origenDelPaciente: 'conversacion',
  },
] as const satisfies readonly RutaGeneraIA[];

export type OperacionGeneraIA = (typeof RUTAS_GENERA_IA)[number]['operationId'];

/** Construye el guardia de una operación `generaIA`; lo compone el módulo `opt-outs`, los controllers solo lo reciben. */
export type GuardiaDeOptOut = (operationId: OperacionGeneraIA) => RequestHandler;

/**
 * Único camino para montar una ruta `generaIA`: toma método y ruta de `RUTAS_GENERA_IA` y monta siempre el guardia
 * entre `previos` (trace, `authorize`, parser del cuerpo) y `posteriores` (handler y manejador de errores).
 */
export function registrarRutaGeneraIA(
  _router: Router,
  _operationId: OperacionGeneraIA,
  _guardia: GuardiaDeOptOut,
  _previos: readonly RequestHandler[],
  ..._posteriores: RequestHandler[]
): void {
  throw new Error('no implementado');
}

/** `true` si el manejador es un guardia creado por el módulo (lo lee el test de cobertura de rutas). */
export function esGuardiaDeOptOut(_manejador: unknown): boolean {
  throw new Error('no implementado');
}
