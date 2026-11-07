'use client';

import { useRef, useState } from 'react';
import type { ConversationTurn } from '../../../../packages/api-contracts/src/types/clinical-api';
import { abrirConversacion, enviarTurno, type ResultadoDeTurno } from './solicitar-turno';

/** `inactivo → enviando → (inactivo | error | bloqueado)`; `bloqueado` es el opt-out de RN-15 (el panel no admite más preguntas). */
export type FaseDeLaConversacion = 'inactivo' | 'enviando' | 'error' | 'bloqueado';

export type ElementoDelHilo =
  { tipo: 'pregunta'; id: string; texto: string } | { tipo: 'turno'; turno: ConversationTurn };

export interface ConversacionEnCurso {
  elementos: readonly ElementoDelHilo[];
  fase: FaseDeLaConversacion;
  enviar: (pregunta: string) => void;
  reintentar: () => void;
}

/**
 * Estado de una conversación: apertura perezosa en el primer envío, una sola petición en curso y el turno del
 * asistente añadido de una vez al llegar (TBD-08). Vive en memoria: ni la pregunta ni el estado van a la URL ni a
 * `localStorage`. Una conversación nueva es otro montaje del panel (`key`), no un reinicio de este estado.
 */
export function useConversacion(
  patientId: string,
  alQuedarseSinSesion: () => void,
): ConversacionEnCurso {
  const [elementos, setElementos] = useState<readonly ElementoDelHilo[]>([]);
  const [fase, setFase] = useState<FaseDeLaConversacion>('inactivo');
  // Guardas síncronas: el estado de React no basta ante un doble envío antes del re-render.
  const enCurso = useRef(false);
  const conversacion = useRef<string | null>(null);
  const ultimaPregunta = useRef<string | null>(null);
  const contador = useRef(0);

  async function pedirTurno(pregunta: string): Promise<ResultadoDeTurno> {
    if (conversacion.current === null) {
      const apertura = await abrirConversacion(patientId);
      if (apertura.tipo !== 'ok') return apertura;
      conversacion.current = apertura.conversationId;
    }
    return enviarTurno(conversacion.current, pregunta);
  }

  async function enviarYMostrar(pregunta: string, esReintento: boolean) {
    if (enCurso.current || fase === 'bloqueado' || pregunta === '') return;
    enCurso.current = true;
    ultimaPregunta.current = pregunta;
    setFase('enviando');
    if (!esReintento) {
      contador.current += 1;
      const id = `pregunta-${contador.current}`;
      setElementos((previos) => [...previos, { tipo: 'pregunta', id, texto: pregunta }]);
    }
    const resultado = await pedirTurno(pregunta);
    enCurso.current = false;
    if (resultado.tipo === 'sin_sesion') return alQuedarseSinSesion();
    if (resultado.tipo === 'ok') {
      setElementos((previos) => [...previos, { tipo: 'turno', turno: resultado.turno }]);
    }
    setFase(
      resultado.tipo === 'ok' ? 'inactivo' : resultado.tipo === 'opt_out' ? 'bloqueado' : 'error',
    );
  }

  return {
    elementos,
    fase,
    enviar: (pregunta) => void enviarYMostrar(pregunta.trim(), false),
    reintentar: () => ultimaPregunta.current && void enviarYMostrar(ultimaPregunta.current, true),
  };
}
