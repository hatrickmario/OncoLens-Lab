'use client';

import { useEffect, useRef } from 'react';
import { mensajeDeError } from '../../lib/evidence/clasificar-fallo';
import { mensajes, rellenar, textoDe } from '../../lib/mensajes';
import estilos from '../evidence.module.css';
import { RateLimitNotice } from './rate-limit-notice';

export type FalloDelAnalisis =
  | { tipo: 'error'; httpStatus: number; traceId: string | null }
  | { tipo: 'limite'; reintentarEnSegundos: number }
  | { tipo: 'red' }
  | { tipo: 'no_realizado' };

export interface AnalysisFailureProps {
  fallo: FalloDelAnalisis;
  onReintentar: () => void;
}

/**
 * Error de transporte, límite o análisis no realizado, sin aviso de IA ni resultado parcial (RN-06). Del error
 * solo se muestra el mensaje por caso y el `traceId`; nunca el `message` ni el `error` de la respuesta. Tras un
 * error el foco va a "Reintentar"; "Reintentar" envía una petición nueva (`[S1 resp. 31]`).
 */
export function AnalysisFailure({ fallo, onReintentar }: AnalysisFailureProps) {
  const { error, noRealizado } = mensajes().evidence;
  const botonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => botonRef.current?.focus(), []);
  if (fallo.tipo === 'no_realizado') {
    return <p className={estilos.error}>{noRealizado.sinTipoCancer}</p>;
  }
  if (fallo.tipo === 'limite') {
    return <RateLimitNotice segundos={fallo.reintentarEnSegundos} onReintentar={onReintentar} />;
  }
  const clave = fallo.tipo === 'red' ? 'evidence.error.red' : mensajeDeError(fallo.httpStatus);
  return (
    <div className={estilos.error} role={fallo.tipo === 'red' ? 'alert' : undefined}>
      <p>{textoDe(clave)}</p>
      {fallo.tipo === 'error' && fallo.traceId && (
        <p>{rellenar(error.codigoTraza, { traceId: fallo.traceId })}</p>
      )}
      <button ref={botonRef} type="button" className={estilos.boton} onClick={onReintentar}>
        {error.reintentar}
      </button>
    </div>
  );
}
