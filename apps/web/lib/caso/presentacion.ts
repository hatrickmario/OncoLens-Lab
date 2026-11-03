import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../mensajes';

export type EventoDelCaso = CaseView['timeline'][number];

/** Tipos de evento cuya procedencia es un texto generado por IA, nunca un dato del paciente (RN-24, D9). */
const TIPOS_DE_IA: readonly string[] = ['analisis_ia', 'resumen_caso'];

export function esEventoDeIa(eventType: string): boolean {
  return TIPOS_DE_IA.includes(eventType);
}

/** Línea de tiempo (fechados) y «Sin fecha confiable» (`datePrecision = incierta`); el orden es el del servidor (D6). */
export function separarSinFecha(timeline: EventoDelCaso[]): {
  fechados: EventoDelCaso[];
  sinFecha: EventoDelCaso[];
} {
  const esIncierto = (e: EventoDelCaso) => e.datePrecision === 'incierta' || e.eventDate === null;
  return {
    fechados: timeline.filter((e) => !esIncierto(e)),
    sinFecha: timeline.filter(esIncierto),
  };
}

/** Rótulo del `eventType`; un tipo que la UI no conoce es «Evento clínico» (el contrato lo deja como `string`). */
export function rotuloDeEvento(eventType: string): string {
  const { tiposDeEvento, tipoDesconocido } = mensajes().caso;
  return rotuloOValor(tiposDeEvento, eventType, tipoDesconocido);
}

/** Rótulo de un valor de texto libre del contrato desde `mapa`; sin entrada se muestra el valor crudo, nunca se oculta (D7). */
export function rotuloOValor(
  mapa: Readonly<Record<string, string>>,
  valor: string,
  respaldo: string = valor,
): string {
  return Object.hasOwn(mapa, valor) ? mapa[valor]! : respaldo;
}

/** `4.1` + `ng/mL` → `4,1 ng/mL` (decimal con coma, como el resto de la interfaz en español). */
export function valorConUnidad(valor: string, unidad: string | null): string {
  return [valor.replace('.', ','), unidad].filter(Boolean).join(' ');
}
