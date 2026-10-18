'use client';

import type { FormEvent, RefObject } from 'react';
import { mensajes, rellenar } from '../../lib/mensajes';
import estilos from '../evidence.module.css';

/** Máximo de `EvidenceAnalysisRequest.query` en el contrato. */
const MAXIMO_PREGUNTA = 2000;
/** El contador se anuncia a lectores de pantalla solo cerca del límite. */
const UMBRAL_ANUNCIO = 1900;

export interface EvidenceQueryFormProps {
  pregunta: string;
  enviando: boolean;
  /** Texto breve del estado, anunciado en una región `role="status"` fuera del resultado. */
  anuncio: string;
  botonRef: RefObject<HTMLButtonElement | null>;
  onCambiar: (pregunta: string) => void;
  onEnviar: () => void;
}

export function EvidenceQueryForm(props: EvidenceQueryFormProps) {
  const { pregunta, enviando, anuncio, botonRef, onCambiar, onEnviar } = props;
  const { formulario } = mensajes().evidence;
  function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (!enviando) onEnviar();
  }
  return (
    <form className={estilos.formulario} onSubmit={alEnviar} noValidate>
      <label htmlFor="pregunta-clinica">{formulario.pregunta}</label>
      <textarea
        id="pregunta-clinica"
        className={estilos.campo}
        value={pregunta}
        maxLength={MAXIMO_PREGUNTA}
        aria-describedby="pregunta-ayuda pregunta-contador"
        onChange={(evento) => onCambiar(evento.target.value)}
      />
      <p id="pregunta-ayuda" className={estilos.ayuda}>
        {formulario.ayuda}
      </p>
      <p
        id="pregunta-contador"
        className={estilos.contador}
        aria-live={pregunta.length >= UMBRAL_ANUNCIO ? 'polite' : 'off'}
      >
        {rellenar(formulario.contador, { n: pregunta.length, max: MAXIMO_PREGUNTA })}
      </p>
      <button ref={botonRef} type="submit" className={estilos.boton} aria-disabled={enviando}>
        {enviando ? formulario.analizando : formulario.analizar}
      </button>
      {enviando && <p className={estilos.espera}>{formulario.espera}</p>}
      <p role="status" aria-live="polite">
        {anuncio}
      </p>
    </form>
  );
}
