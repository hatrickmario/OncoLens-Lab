'use client';

import { useEffect } from 'react';
import type { CampoConFoco } from './resolver-item';

/** Ids de los controles de los formularios de registro manual (uno abierto a la vez), para darles el foco por URL. */
export const ID_DE_CAMPO = {
  biomarcadorValor: 'rm-biomarcador-valor',
  histologia: 'rm-diagnostico-histologia',
  valorDeEstadio: 'rm-diagnostico-valor-estadio',
  valorFuncional: 'rm-diagnostico-valor-funcional',
  sistemaDeGradacion: 'rm-diagnostico-sistema',
  nottingham: 'rm-diagnostico-nottingham',
  patronPrimario: 'rm-diagnostico-patron-primario',
} as const;

/**
 * Id del control que recibe el foco al abrir el diagnóstico por `?item=`. La gradación enfoca su primer control:
 * el selector de sistema si el catálogo ofrece más de uno; si no, el primero del sistema que corresponde.
 */
export function idDelCampoConFoco(
  campo: CampoConFoco | undefined,
  sistemasDeGradacion: readonly string[],
  sistemaInicial: string,
): string | undefined {
  if (campo === undefined) return undefined;
  const primeroDeLaGradacion =
    sistemasDeGradacion.length > 1
      ? ID_DE_CAMPO.sistemaDeGradacion
      : sistemaInicial === 'gleason_isup'
        ? ID_DE_CAMPO.patronPrimario
        : ID_DE_CAMPO.nottingham;
  const ids: Record<CampoConFoco, string> = {
    histology: ID_DE_CAMPO.histologia,
    stageValue: ID_DE_CAMPO.valorDeEstadio,
    performanceValue: ID_DE_CAMPO.valorFuncional,
    gradacion: primeroDeLaGradacion,
  };
  return ids[campo];
}

/**
 * Da el foco al control `id` una sola vez, al montar el formulario. `autoFocus` está prohibido (jsx-a11y): aquí el foco
 * es una decisión explícita de la apertura por URL, no del navegador. Corre antes que el foco inicial de Radix, que
 * respeta un foco ya dentro del diálogo.
 */
export function useFocoInicial(id: string | undefined): void {
  useEffect(() => {
    if (id !== undefined) document.getElementById(id)?.focus();
  }, [id]);
}
