'use client';

import { mensajeDeError } from '../../lib/evidence/clasificar-fallo';
import { mensajes, rellenar, textoDe } from '../../lib/mensajes';
import estilos from '../evidence.module.css';

export type FalloDelAnalisis =
  { tipo: 'error'; httpStatus: number; traceId: string | null } | { tipo: 'no_realizado' };

export interface AnalysisFailureProps {
  fallo: FalloDelAnalisis;
  onReintentar: () => void;
}

/**
 * Error de transporte o análisis no realizado, sin aviso de IA ni resultado parcial (RN-06). Del error solo
 * se muestra el mensaje por código HTTP y el `traceId`; "Reintentar" envía una petición nueva (`[S1 resp. 31]`).
 */
export function AnalysisFailure({ fallo, onReintentar }: AnalysisFailureProps) {
  const { error, noRealizado } = mensajes().evidence;
  if (fallo.tipo === 'no_realizado') {
    return <p className={estilos.error}>{noRealizado.sinTipoCancer}</p>;
  }
  return (
    <div className={estilos.error}>
      <p>{textoDe(mensajeDeError(fallo.httpStatus))}</p>
      {fallo.traceId && <p>{rellenar(error.codigoTraza, { traceId: fallo.traceId })}</p>}
      <button type="button" className={estilos.boton} onClick={onReintentar}>
        {error.reintentar}
      </button>
    </div>
  );
}
