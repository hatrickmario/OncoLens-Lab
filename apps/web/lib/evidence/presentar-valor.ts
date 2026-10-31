import type { CitedSource } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes, rellenar } from '../mensajes';
import { formatearFechaIso } from './formatear-fecha';
import { numeroONoDisponible, valorONoDisponible } from './procedencia';
import type { ValorDelEstudio } from './valores-del-estudio';

export interface ValorPresentado {
  clave: string;
  texto: string;
}

export interface OpcionesDePresentacion {
  /** Con `valores_en_conflicto`: fecha y tamaño de muestra de la fuente del fragmento, o «No disponible» (RN-25). */
  conDatosDelFragmento: boolean;
}

/**
 * Línea de un valor del estudio: «valor · Fragmento [n] · según fuente · datos». `n` es la posición del fragmento
 * entre las citas de la tarjeta y la fuente se nombra para que dos fragmentos de un mismo documento se distingan
 * (D8). El valor lo extrajo un modelo: va como texto, nunca como cita. Sin fragmento citado, lo dice (RN-01).
 */
export function presentarValor(
  valor: ValorDelEstudio,
  citas: readonly CitedSource[],
  { conDatosDelFragmento }: OpcionesDePresentacion,
): ValorPresentado {
  const textos = mensajes().evidence.aplicabilidad;
  const posicion = citas.findIndex((c) => c.chunkId === valor.chunkId);
  const cita = posicion >= 0 ? citas[posicion] : undefined;
  const nombre =
    valor.scope === 'elegibilidad'
      ? valor.value
      : `${textos.alcance[valor.scope]} «${valor.value}»`;
  const partes = [nombre];
  if (!cita) partes.push(textos.fragmentoNoDisponible);
  else {
    partes.push(rellenar(textos.fragmento, { n: posicion + 1 }));
    partes.push(
      rellenar(textos.fuenteDelFragmento, { fuente: `${cita.sourceName} · ${cita.externalId}` }),
    );
    if (conDatosDelFragmento) partes.push(...datosDeLaFuente(cita));
  }
  return { clave: `${valor.chunkId ?? 'sin-fragmento'}:${valor.value}`, texto: partes.join(' · ') };
}

function datosDeLaFuente(cita: CitedSource): string[] {
  const { fechaDelFragmento, tamanoDelFragmento } = mensajes().evidence.aplicabilidad;
  const fecha = cita.publishedAt?.trim() ? formatearFechaIso(cita.publishedAt) : null;
  return [
    rellenar(fechaDelFragmento, { fecha: valorONoDisponible(fecha) }),
    rellenar(tamanoDelFragmento, { n: numeroONoDisponible(cita.sampleSize) }),
  ];
}
