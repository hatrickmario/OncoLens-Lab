import {
  esquemaPreguntaNormalizada,
  normalizarPregunta,
} from '../../../../packages/clinical-language/src/normalizar-pregunta';
import { zEvidenceAnalysisRequest } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';

const CAMPO_PREGUNTA = zEvidenceAnalysisRequest.shape.query;

/**
 * Pregunta tal como la valida y la envía el cliente: la regla NFC + espacios de `clinical-api` (US-250) y después
 * los límites del contrato. Único punto de composición en `web`; el campo conserva el texto pegado.
 */
export const ESQUEMA_PREGUNTA = esquemaPreguntaNormalizada(CAMPO_PREGUNTA);

/** Máximo de `EvidenceAnalysisRequest.query`: sale del schema generado del contrato, no de un literal. */
export const MAXIMO_PREGUNTA: number = CAMPO_PREGUNTA.maxLength ?? Number.POSITIVE_INFINITY;

/** Longitud que cuenta el contrato: la de la pregunta ya normalizada, no la del texto pegado (AC-3). */
export function longitudDePregunta(texto: string): number {
  return normalizarPregunta(texto).length;
}

export type ValidacionDePregunta = { ok: true } | { ok: false; max: number };

/** Valida el largo de la pregunta ya normalizada (AC-3: NFC, no NFD); el Route Handler vuelve a validar (UX, no seguridad). */
export function validarPregunta(pregunta: string): ValidacionDePregunta {
  const resultado = ESQUEMA_PREGUNTA.safeParse(pregunta);
  const excede = !resultado.success && resultado.error.issues.some((i) => i.code === 'too_big');
  return excede ? { ok: false, max: MAXIMO_PREGUNTA } : { ok: true };
}

/** Un análisis se envía solo si no hay otro en curso (guarda síncrona, no el estado de React) y hay pregunta. */
export function puedeEnviar(enCurso: boolean, pregunta: string): boolean {
  return !enCurso && pregunta.trim().length > 0;
}

/** Tope de cordura del plazo de reintento: más de una hora no es un límite de generación sino una respuesta mal formada. */
export const MAXIMO_REINTENTO_SEGUNDOS = 3600;

/** `Retry-After` en segundos enteros de 0 a una hora; ausente, con otra forma (fecha HTTP, texto) o absurdo → `null` (RN-30). */
export function leerRetryAfter(cabeceras: Pick<Headers, 'get'>): number | null {
  const valor = cabeceras.get('Retry-After')?.trim();
  if (valor === undefined || !/^\d+$/.test(valor)) return null;
  const segundos = Number(valor);
  return segundos <= MAXIMO_REINTENTO_SEGUNDOS ? segundos : null;
}
