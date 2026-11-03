import type { FaseDelPanel } from '../fase-del-panel';
import type { ResultadoDeSeguimiento } from './solicitar-seguimiento';

export type FaseDelHilo =
  | { tipo: 'inactivo' }
  | { tipo: 'enviando' }
  | { tipo: 'limite_alcanzado' }
  | { tipo: 'no_procesable' }
  | Extract<FaseDelPanel, { tipo: 'error' | 'limite' | 'red' }>;

/** Fase que sigue a una petición respondida y sin sesión caída; el turno de un `201` lo añade el hilo, no la fase. */
export function faseTrasSeguimiento(
  resultado: Exclude<ResultadoDeSeguimiento, { tipo: 'sin_sesion' | 'ok' }>,
): FaseDelHilo {
  if (resultado.tipo === 'limite_alcanzado' || resultado.tipo === 'no_procesable') return resultado;
  if (resultado.tipo === 'red' || resultado.tipo === 'limite') return resultado;
  const { httpStatus, codigo, traceId } = resultado;
  return { tipo: 'error', httpStatus, traceId, codigo };
}
