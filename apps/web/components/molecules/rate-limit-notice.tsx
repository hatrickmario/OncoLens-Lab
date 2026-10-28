'use client';

import { useEffect, useState } from 'react';
import { mensajes, rellenar } from '../../lib/mensajes';
import estilos from '../evidence.module.css';
import { NonBlockingNotice } from './non-blocking-notice';

export interface RateLimitNoticeProps {
  /** Plazo de la cabecera `Retry-After` (RN-30): viene de la respuesta, nunca de un literal. */
  segundos: number;
  onReintentar: () => void;
}

/** Aviso del `429`: informa el plazo y habilita "Reintentar" solo cuando vence; no bloquea nada más (RN-26). */
export function RateLimitNotice({ segundos, onReintentar }: RateLimitNoticeProps) {
  const { error } = mensajes().evidence;
  const [vencido, setVencido] = useState(false);
  useEffect(() => {
    const temporizador = setTimeout(() => setVencido(true), segundos * 1000);
    return () => clearTimeout(temporizador);
  }, [segundos]);
  return (
    <div>
      <NonBlockingNotice>
        <p>{rellenar(error.limite, { s: segundos })}</p>
      </NonBlockingNotice>
      <button type="button" className={estilos.boton} disabled={!vencido} onClick={onReintentar}>
        {error.reintentar}
      </button>
    </div>
  );
}
