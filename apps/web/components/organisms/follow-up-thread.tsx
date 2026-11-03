'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import type {
  CitedSource,
  EvidenceAnalysis,
  FollowUpTurn,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { ID_CAMPO_PREGUNTA, puedeEnviar } from '../../lib/evidence/reglas-del-formulario';
import {
  contadorDeSeguimiento,
  textoDelContador,
} from '../../lib/evidence/seguimiento/contador-de-seguimiento';
import {
  faseTrasSeguimiento,
  type FaseDelHilo,
} from '../../lib/evidence/seguimiento/fase-tras-seguimiento';
import { solicitarSeguimiento } from '../../lib/evidence/seguimiento/solicitar-seguimiento';
import { mensajes } from '../../lib/mensajes';
import { RUTA_LOGIN_EXPIRADA } from '../../lib/sesion/motivo-de-sesion';
import { FollowUpContext } from '../molecules/follow-up-context';
import { FollowUpForm } from '../molecules/follow-up-form';
import { FollowUpPhaseNotice } from '../molecules/follow-up-phase-notice';
import { FollowUpTurnItem } from '../molecules/follow-up-turn-item';

export interface FollowUpThreadProps {
  analisis: EvidenceAnalysis;
  onVerFragmento: (cita: CitedSource, idChip: string) => void;
}

/** «Nuevo análisis» conserva el análisis y lleva el foco al campo de pregunta del panel (design D6). */
function enfocarCampoDelPanel() {
  document.getElementById(ID_CAMPO_PREGUNTA)?.focus();
}

/**
 * Hilo de preguntas de seguimiento bajo un análisis con evidencia (US-219). El servidor manda: el turno se añade solo
 * con un `201` ya validado, sin contenido parcial (TBD-08), y una sola petición está en curso a la vez.
 */
export function FollowUpThread({ analisis, onVerFragmento }: FollowUpThreadProps) {
  const router = useRouter();
  const idTitulo = useId();
  const { followUp } = mensajes();
  const enCurso = useRef(false);
  const ultima = useRef('');
  const [pregunta, setPregunta] = useState('');
  const [turnos, setTurnos] = useState<FollowUpTurn[]>([]);
  const [fase, setFase] = useState<FaseDelHilo>({ tipo: 'inactivo' });
  const { maxFollowUps } = analisis.analysisBasis;
  const limite = fase.tipo === 'limite_alcanzado';

  async function enviar(texto: string) {
    if (!puedeEnviar(enCurso.current, texto)) return;
    enCurso.current = true;
    ultima.current = texto;
    setFase({ tipo: 'enviando' });
    const resultado = await solicitarSeguimiento(analisis.id, texto);
    enCurso.current = false;
    if (resultado.tipo === 'sin_sesion') return router.replace(RUTA_LOGIN_EXPIRADA);
    if (resultado.tipo === 'ok') {
      setTurnos((previos) => [...previos, resultado.turno]);
      setPregunta('');
      return setFase({ tipo: 'inactivo' });
    }
    setFase(faseTrasSeguimiento(resultado));
  }

  const contador = contadorDeSeguimiento(turnos, maxFollowUps, limite);
  return (
    <section aria-labelledby={idTitulo}>
      <h4 id={idTitulo}>{followUp.titulo}</h4>
      <p>{textoDelContador(contador)}</p>
      <FollowUpContext />
      <div role="log" aria-live="polite" aria-label={followUp.historial}>
        {turnos.map((turno) => (
          <FollowUpTurnItem
            key={turno.id}
            turno={turno}
            base={analisis.analysisBasis}
            onVerFragmento={onVerFragmento}
            onNuevoAnalisis={enfocarCampoDelPanel}
          />
        ))}
      </div>
      <FollowUpPhaseNotice
        fase={fase}
        maxFollowUps={maxFollowUps}
        onNuevoAnalisis={enfocarCampoDelPanel}
        onReintentar={() => void enviar(ultima.current)}
      />
      <FollowUpForm
        valor={pregunta}
        enviando={fase.tipo === 'enviando'}
        deshabilitado={limite}
        error={fase.tipo === 'no_procesable' ? followUp.noProcesable : null}
        onCambiar={setPregunta}
        onEnviar={() => void enviar(pregunta)}
      />
    </section>
  );
}
