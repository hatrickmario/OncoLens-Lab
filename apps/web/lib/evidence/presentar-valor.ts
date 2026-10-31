import type { CitedSource } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes, rellenar } from '../mensajes';
import type { ValorDelEstudio } from './valores-del-estudio';

export interface ValorPresentado {
  clave: string;
  texto: string;
}

export interface OpcionesDePresentacion {
  /** Con `valores_en_conflicto`: fecha y tamaño de muestra del fragmento, solo si constan (F-23). */
  conDatosDelFragmento: boolean;
  /** Los valores de contexto llevan su alcance delante («subgrupo «TNBC»»). */
  conAlcance: boolean;
}

/**
 * Línea de un valor del estudio: «valor · Fragmento [n] · datos». `n` es la posición del fragmento entre las
 * citas de la tarjeta (D8). El valor lo extrajo un modelo: va como texto, nunca como cita.
 */
export function presentarValor(
  valor: ValorDelEstudio,
  citas: readonly CitedSource[],
  { conDatosDelFragmento, conAlcance }: OpcionesDePresentacion,
): ValorPresentado {
  const { fragmento, fechaDelFragmento, tamanoDelFragmento, alcance } =
    mensajes().evidence.aplicabilidad;
  const posicion = citas.findIndex((c) => c.chunkId === valor.chunkId);
  const cita = posicion >= 0 ? citas[posicion] : undefined;
  const nombre =
    conAlcance && valor.scope !== 'elegibilidad'
      ? `${alcance[valor.scope]} «${valor.value}»`
      : valor.value;
  const partes = [nombre];
  if (cita) partes.push(rellenar(fragmento, { n: posicion + 1 }));
  if (cita && conDatosDelFragmento) {
    if (cita.publishedAt) partes.push(rellenar(fechaDelFragmento, { fecha: cita.publishedAt }));
    if (cita.sampleSize != null) partes.push(rellenar(tamanoDelFragmento, { n: cita.sampleSize }));
  }
  return { clave: `${valor.chunkId ?? 'sin-fragmento'}:${valor.value}`, texto: partes.join(' · ') };
}
