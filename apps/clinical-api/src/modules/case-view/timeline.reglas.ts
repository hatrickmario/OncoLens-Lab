import type {
  BiomarcadorDelCaso,
  DatosDelCaso,
  EventoDelTimeline,
  ProcedenciaDeFila,
} from './ports.js';

/** `eventType` de los eventos que salen de un `AIAnalysisRecord` (D7, `[S5 resp. 11a]`): la UI los rotula «Generado por IA». */
export const TIPOS_DE_EVENTO_DE_IA = ['analisis_ia', 'resumen_caso'] as const;

/** Evento del timeline con las claves de orden que el contrato no expone (D5). */
export interface EventoConOrden {
  readonly evento: EventoDelTimeline;
  readonly rangoDelOrigen: number;
  readonly creadoEn: string;
}

export function idDeEventoDerivado(_origen: string, _idDeLaFila: string, _hito: string): string {
  throw new Error('no implementado');
}

export function procedenciaDeExamen(
  _biomarcadores: readonly BiomarcadorDelCaso[],
): ProcedenciaDeFila {
  throw new Error('no implementado');
}

export function eventosDerivados(_datos: DatosDelCaso): EventoConOrden[] {
  throw new Error('no implementado');
}

export function ordenarTimeline(_eventos: readonly EventoConOrden[]): EventoDelTimeline[] {
  throw new Error('no implementado');
}
