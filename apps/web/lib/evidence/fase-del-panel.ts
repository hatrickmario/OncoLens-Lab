import type { EvidenceAnalysis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { clasificarFallo, type CodigoConEstadoPropio } from './clasificar-fallo';
import { clasificarResultado } from './clasificar-resultado';
import type { ResultadoDeSolicitud } from './solicitar-analisis';

export type FaseDelPanel =
  | { tipo: 'inactivo' }
  | { tipo: 'enviando' }
  | { tipo: 'ok'; analisis: EvidenceAnalysis }
  | {
      tipo: 'error';
      httpStatus: number;
      traceId: string | null;
      codigo?: CodigoConEstadoPropio | null;
    }
  | { tipo: 'limite'; reintentarEnSegundos: number }
  | { tipo: 'red' }
  | { tipo: 'no_realizado' };

export type FaseDeFallo = Extract<
  FaseDelPanel,
  { tipo: 'error' | 'limite' | 'red' | 'no_realizado' }
>;

const TIPOS_DE_FALLO: ReadonlySet<FaseDelPanel['tipo']> = new Set([
  'error',
  'limite',
  'red',
  'no_realizado',
]);

export function esFallo(fase: FaseDelPanel): fase is FaseDeFallo {
  return TIPOS_DE_FALLO.has(fase.tipo);
}

/** Fase que sigue a una petición respondida; un estado no soportado se trata como error sin detalles (D2). */
export function faseTrasSolicitud(
  resultado: Exclude<ResultadoDeSolicitud, { tipo: 'sin_sesion' }>,
): FaseDelPanel {
  if (resultado.tipo === 'red' || resultado.tipo === 'limite') return resultado;
  if (resultado.tipo === 'ok') {
    return clasificarResultado(resultado.analisis) === 'no_soportado'
      ? { tipo: 'error', httpStatus: 0, traceId: resultado.analisis.traceId }
      : { tipo: 'ok', analisis: resultado.analisis };
  }
  const { httpStatus, codigo, traceId } = resultado;
  return clasificarFallo(httpStatus, codigo) === 'no_realizado'
    ? { tipo: 'no_realizado' }
    : { tipo: 'error', httpStatus, traceId, codigo };
}
