import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { conEvidenciaAplicabilidad, conEvidenciaPoblacionA_M2B } from './msw/evidence-analyses';

/** Nombre del botón que despliega la tabla de una opción (D1). */
export const VER_APLICABILIDAD = 'Ver aplicabilidad por criterio';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const copia = <T>(valor: T): T => structuredClone(valor);

/** Texto sin los símbolos `aria-hidden`, con espacios normalizados. */
export function textoSinSimbolos(nodo: HTMLElement): string {
  const clon = nodo.cloneNode(true) as HTMLElement;
  clon.querySelectorAll('[aria-hidden="true"]').forEach((simbolo) => simbolo.remove());
  return clon.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/**
 * FX-08b-a (doc-a1 × A-M1, catálogo de test de 5 criterios): el ejemplo `con-evidencia-s3-aplicabilidad.json`
 * sin la fila `estadio` (el cálculo de `l1d-293` la deja fuera). Conteos `{ 2, 0, 0, 3 }`.
 */
export function fx08ba(): Json {
  const cuerpo = copia(conEvidenciaAplicabilidad) as Json;
  const resumen = { coincide: 2, parcial: 0, noCoincide: 0, desconocido: 3 };
  const fuente = cuerpo.applicability[0];
  fuente.criteria = fuente.criteria.filter((c: Json) => c.criterion !== 'estadio');
  fuente.summary = resumen;
  cuerpo.evidenceOptions[0].applicabilitySummary = resumen;
  cuerpo.evidenceOptions[0].perSource[0].summary = resumen;
  return cuerpo;
}

/** Opción con dos fuentes (FX-08b-b): la de `fx08ba()` más una segunda fuente citada con 2 criterios. */
export function fx08bbDosFuentes(): Json {
  const cuerpo = fx08ba();
  const opcion = cuerpo.evidenceOptions[0];
  const segunda = {
    ...copia(opcion.citedSources[0]),
    title: 'Segunda fuente sintética',
    externalId: 'doc-a2-sintetica',
    chunkId: 'chunk_seg_1',
  };
  const resumen = { coincide: 1, parcial: 0, noCoincide: 0, desconocido: 1 };
  opcion.citedSources.push(segunda);
  opcion.perSource.push({
    externalId: segunda.externalId,
    summary: resumen,
    populationNotComparable: false,
  });
  const criterios = copia(cuerpo.applicability[0].criteria.slice(0, 2)) as Json[];
  criterios.forEach((c) => (c.citedSources = [segunda]));
  cuerpo.applicability.push({
    externalId: segunda.externalId,
    criteria: criterios,
    summary: resumen,
    populationNotComparable: false,
  });
  return cuerpo;
}

/** El ejemplo A-M2-b con una modificación sobre el criterio de la opción `indice`. */
export function a_m2bConCriterio(indice: number, cambios: Json): Json {
  const cuerpo = copia(conEvidenciaPoblacionA_M2B) as Json;
  Object.assign(cuerpo.applicability[indice].criteria[0], cambios);
  return cuerpo;
}

/** Despliega la tabla de la opción `indice` y devuelve su contenedor. */
export async function abrirTabla(usuario: UserEvent, indice = 0): Promise<HTMLElement> {
  const tarjetas = await screen.findAllByRole('article');
  const boton = within(tarjetas[indice]!).getByRole('button', { name: VER_APLICABILIDAD });
  await usuario.click(boton);
  return document.getElementById(boton.getAttribute('aria-controls') ?? '')!;
}

/** Fila de la tabla cuyo criterio (celda de encabezado de fila) contiene `criterio`. */
export function filaDe(tabla: HTMLElement, criterio: string | RegExp): HTMLElement {
  const encabezado = within(tabla).getByRole('rowheader', { name: criterio });
  return encabezado.closest('tr')!;
}
