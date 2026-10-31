'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ValorPresentado } from '../../lib/evidence/presentar-valor';
import { mensajes, rellenar } from '../../lib/mensajes';
import estilos from '../evidence.module.css';

/** Cuántos valores se leen antes de «ver más» (ADR-47). */
export const VALORES_VISIBLES = 3;

export interface StudyValueListProps {
  /** Valores que cuentan para el estado, en el orden recibido. */
  valores: ValorPresentado[];
  /** Subgrupo o mención: se leen aparte y no cuentan para el estado. */
  contexto: ValorPresentado[];
}

/** Valores del estudio de un criterio: hasta 3 y «ver más» local, sin peticiones (D5). */
export function StudyValueList({ valores, contexto }: StudyValueListProps) {
  const {
    sinValorDelEstudio,
    verMasUno,
    verMasVarios,
    verMenos,
    contexto: rotuloContexto,
  } = mensajes().evidence.aplicabilidad;
  const idLista = useId();
  const primerRevelado = useRef<HTMLLIElement>(null);
  const [todos, setTodos] = useState(false);
  const restantes = valores.length - VALORES_VISIBLES;
  const mostrados = todos ? valores : valores.slice(0, VALORES_VISIBLES);

  useEffect(() => {
    if (todos) primerRevelado.current?.focus();
  }, [todos]);

  if (valores.length === 0 && contexto.length === 0) return <span>{sinValorDelEstudio}</span>;
  return (
    <>
      {valores.length > 0 && (
        <ul id={idLista} className={estilos.valores}>
          {mostrados.map((valor, indice) => (
            <li
              key={`${valor.clave}:${indice}`}
              ref={indice === VALORES_VISIBLES ? primerRevelado : undefined}
              tabIndex={indice === VALORES_VISIBLES ? -1 : undefined}
            >
              {valor.texto}
            </li>
          ))}
        </ul>
      )}
      {restantes > 0 && (
        <button
          type="button"
          className={estilos.chip}
          aria-expanded={todos}
          aria-controls={idLista}
          onClick={() => setTodos(!todos)}
        >
          {todos
            ? verMenos
            : restantes === 1
              ? verMasUno
              : rellenar(verMasVarios, { n: restantes })}
        </button>
      )}
      {contexto.length > 0 && (
        <>
          <p className={estilos.contextoDelEstado}>{rotuloContexto}</p>
          <ul className={estilos.valores}>
            {contexto.map((valor, indice) => (
              <li key={`${valor.clave}:${indice}`}>{valor.texto}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
