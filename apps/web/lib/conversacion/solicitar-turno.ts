import type { ConversationTurn } from '../../../../packages/api-contracts/src/types/clinical-api';
import {
  zConversationId,
  zConversationTurnCreate,
  zEvidenceAnalysis,
} from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';

export type ResultadoDeApertura =
  | { tipo: 'ok'; conversationId: string }
  | { tipo: 'sin_sesion' }
  | { tipo: 'error' };

export type ResultadoDeTurno =
  | { tipo: 'ok'; turno: ConversationTurn }
  | { tipo: 'sin_sesion' }
  | { tipo: 'opt_out' }
  | { tipo: 'error' };

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  valor !== null && typeof valor === 'object' && !Array.isArray(valor);

/**
 * Lectura tolerante (design D3): un campo o un `kind` desconocido no rompe la tarjeta, así que la respuesta no se
 * valida con el schema estricto del contrato; solo se exige lo que la tarjeta necesita para pintarse.
 */
function esTurno(valor: unknown): valor is ConversationTurn {
  return (
    esObjeto(valor) &&
    typeof valor.id === 'string' &&
    typeof valor.intent === 'string' &&
    Array.isArray(valor.blocks) &&
    Array.isArray(valor.notices)
  );
}

/** `fetch` al BFF de `web` (mismo origen, cookie de sesión); un fallo de red es `null`, nunca una excepción. */
const alBff = (llamada: Promise<Response>): Promise<Response | null> => llamada.catch(() => null);

/** `POST /api/patients/{id}/conversations` al mismo origen, sin cuerpo: abre una conversación nueva (apertura perezosa). */
export async function abrirConversacion(patientId: string): Promise<ResultadoDeApertura> {
  const respuesta = await alBff(
    fetch(`/api/patients/${encodeURIComponent(patientId)}/conversations`, {
      method: 'POST',
      credentials: 'same-origin',
    }),
  );
  if (respuesta?.status === 401) return { tipo: 'sin_sesion' };
  if (!respuesta?.ok) return { tipo: 'error' };
  const cuerpo: unknown = await respuesta.json().catch(() => null);
  const id = zConversationId.safeParse(esObjeto(cuerpo) ? cuerpo.conversationId : null);
  return id.success ? { tipo: 'ok', conversationId: id.data } : { tipo: 'error' };
}

/**
 * `POST /api/conversations/{id}/turns`: la pregunta va solo en el cuerpo, validado con el schema Zod del contrato; la
 * respuesta es siempre el turno completo y ya persistido (nunca tokens parciales, TBD-08). Un `403` es opt-out (RN-15).
 */
export async function enviarTurno(
  conversationId: string,
  question: string,
): Promise<ResultadoDeTurno> {
  const cuerpo = zConversationTurnCreate.safeParse({ question });
  if (!cuerpo.success) return { tipo: 'error' };
  const respuesta = await alBff(
    fetch(`/api/conversations/${encodeURIComponent(conversationId)}/turns`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo.data),
    }),
  );
  if (respuesta?.status === 401) return { tipo: 'sin_sesion' };
  if (respuesta?.status === 403) return { tipo: 'opt_out' };
  if (!respuesta?.ok) return { tipo: 'error' };
  const turno: unknown = await respuesta.json().catch(() => null);
  if (!esTurno(turno)) return { tipo: 'error' };
  // El análisis de un turno de evidencia sí se valida con el schema del contrato: un valor fuera del enum no se pinta
  // a medias (sin resultado parcial, RN-06); el resto del turno se lee con tolerancia.
  if (turno.evidenceAnalysis !== undefined && !zEvidenceAnalysis.safeParse(turno.evidenceAnalysis).success) {
    return { tipo: 'error' };
  }
  return { tipo: 'ok', turno };
}
