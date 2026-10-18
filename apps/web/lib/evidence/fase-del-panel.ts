import type { EvidenceAnalysis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { clasificarFallo } from './clasificar-fallo';
import { clasificarResultado } from './clasificar-resultado';
import type { ResultadoDeSolicitud } from './solicitar-analisis';

export type FaseDelPanel =
  | { tipo: 'inactivo' }
  | { tipo: 'enviando' }
  | { tipo: 'ok'; analisis: EvidenceAnalysis }
  | { tipo: 'error'; httpStatus: number; traceId: string | null }
  | { tipo: 'no_realizado' };

/** Fase que sigue a una petición respondida; un estado no soportado se trata como error sin detalles (D2). */
export function faseTrasSolicitud(
  resultado: Exclude<ResultadoDeSolicitud, { tipo: 'sin_sesion' }>,
): FaseDelPanel {
  if (resultado.tipo === 'ok') {
    return clasificarResultado(resultado.analisis) === 'no_soportado'
      ? { tipo: 'error', httpStatus: 0, traceId: resultado.analisis.traceId }
      : { tipo: 'ok', analisis: resultado.analisis };
  }
  const { httpStatus, codigo, traceId } = resultado;
  return clasificarFallo(httpStatus, codigo) === 'no_realizado'
    ? { tipo: 'no_realizado' }
    : { tipo: 'error', httpStatus, traceId };
}
