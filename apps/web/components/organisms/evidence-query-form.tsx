'use client';

import { useEffect, useRef, type FormEvent, type ReactNode, type RefObject } from 'react';
import { MAXIMO_PREGUNTA } from '../../lib/evidence/reglas-del-formulario';
import { mensajes, rellenar } from '../../lib/mensajes';
import estilos from '../evidence.module.css';

export interface EvidenceQueryFormProps {
  pregunta: string;
  enviando: boolean;
  /** Máximo de la pregunta cuando se lo excede; `null` si el largo es válido (AC-4). */
  errorMaximo: number | null;
  /** Texto breve del estado, anunciado en una región `role="status"` fuera del resultado. */
  anuncio: string;
  /** Aviso previo al botón (faltantes, checklist caído o tipo no habilitado); informativo, nunca lo deshabilita. */
  aviso?: ReactNode;
  /** Id del resumen del aviso, si lo hay: el botón lo referencia con `aria-describedby`. */
  descripcionDelBoton?: string;
  botonRef: RefObject<HTMLButtonElement | null>;
  onCambiar: (pregunta: string) => void;
  onEnviar: () => void;
}

export function EvidenceQueryForm(props: EvidenceQueryFormProps) {
  const { pregunta, enviando, errorMaximo, anuncio, aviso, descripcionDelBoton, botonRef } = props;
  const { onCambiar, onEnviar } = props;
  const { formulario } = mensajes().evidence;
  // Un botón deshabilitado pierde el foco: se lo devuelve al terminar la petición (sin mover el foco, US-061 AC-6).
  const teniaFoco = useRef(false);
  useEffect(() => {
    if (enviando || !teniaFoco.current) return;
    teniaFoco.current = false;
    botonRef.current?.focus();
  }, [enviando, botonRef]);
  function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    teniaFoco.current = document.activeElement === botonRef.current;
    onEnviar();
  }
  const describe = ['pregunta-ayuda', errorMaximo !== null && 'pregunta-error', 'pregunta-contador']
    .filter(Boolean)
    .join(' ');
  return (
    <form className={estilos.formulario} onSubmit={alEnviar} noValidate>
      <label htmlFor="pregunta-clinica">{formulario.pregunta}</label>
      <textarea
        id="pregunta-clinica"
        className={estilos.campo}
        value={pregunta}
        aria-describedby={describe}
        aria-invalid={errorMaximo !== null}
        onChange={(evento) => onCambiar(evento.target.value)}
      />
      <p id="pregunta-ayuda" className={estilos.ayuda}>
        {formulario.ayuda}
      </p>
      {errorMaximo !== null && (
        <p id="pregunta-error" className={estilos.errorCampo}>
          {rellenar(formulario.maximo, { max: errorMaximo })}
        </p>
      )}
      <p
        id="pregunta-contador"
        className={estilos.contador}
        aria-live={errorMaximo !== null ? 'polite' : 'off'}
      >
        {rellenar(formulario.contador, { n: pregunta.length, max: MAXIMO_PREGUNTA })}
      </p>
      {aviso}
      <button
        ref={botonRef}
        type="submit"
        className={estilos.boton}
        disabled={enviando}
        aria-describedby={descripcionDelBoton}
      >
        {enviando ? formulario.analizando : formulario.analizar}
      </button>
      {enviando && <p className={estilos.espera}>{formulario.espera}</p>}
      <p role="status" aria-live="polite">
        {anuncio}
      </p>
    </form>
  );
}
