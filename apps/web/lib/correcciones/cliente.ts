import type { CorrectionHistoryEntry } from '../../../../packages/api-contracts/src/types/clinical-api';
import {
  zCorrectionHistory,
  zErrorCorreccionInvalida,
} from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { mensajes } from '../mensajes';
import { esIncoherenciaDeDeclaracion } from '../registro-manual/declaracion-de-ausencia';

/** Error de una corrección ya traducido al texto que ve el oncólogo; `campo` es la propiedad del cuerpo, si la hay. */
export interface ErrorDeCorreccion {
  campo?: string;
  mensaje: string;
  /** Código `error` del servidor (`CUERPO_INVALIDO`…), si lo trae; no se muestra. */
  codigo?: string;
}

export type ResultadoDeCorreccion = { tipo: 'ok' } | { tipo: 'error'; error: ErrorDeCorreccion };

export type ResultadoDeHistorico =
  { tipo: 'ok'; versiones: CorrectionHistoryEntry[] } | { tipo: 'error' };

export type DatoCorregible =
  'biomarkers' | 'clinical-notes' | 'prior-treatments' | 'clinical-attributes';

/** Un dato corregible del BFF (nunca clinical-api): solo ids opacos, sin identidad del paciente (RN-10). */
export interface RefDeDato {
  pacienteId: string;
  dato: DatoCorregible;
  id: string;
}

function leerJson(texto: string): Record<string, unknown> {
  try {
    const dato: unknown = JSON.parse(texto);
    return typeof dato === 'object' && dato !== null ? (dato as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Texto fijo de un 422 por `error` y `field`; el `message` del servidor nunca se muestra (sin jerga ni eco de valores). */
function textoDelError422(cuerpo: { error: string; field?: string | undefined }): string {
  const { errores, egresado } = mensajes().ficha.correccion;
  if (cuerpo.error === 'PACIENTE_EGRESADO') return egresado;
  if (cuerpo.error === 'VALOR_FUERA_DE_CATALOGO') return errores.valorFormato;
  if (esIncoherenciaDeDeclaracion({ campo: cuerpo.field, codigo: cuerpo.error })) {
    return errores.declaracionConTratamientos;
  }
  const porCampo: Record<string, string> = {
    performedAt: errores.fechaFutura,
    value: errores.valorFormato,
    content: errores.textoDeNota,
    endedAt: errores.finAnteriorAlInicio,
    endReason: errores.motivoDeFin,
  };
  if (cuerpo.field === undefined) return errores.sinCambios;
  return porCampo[cuerpo.field] ?? errores.campoInvalido;
}

function traducirError(status: number, cuerpo: Record<string, unknown>): ErrorDeCorreccion {
  const { errores } = mensajes().ficha.correccion;
  if (status === 409) return { mensaje: errores.noVigente };
  if (status === 403) return { mensaje: errores.permiso };
  if (status === 404) return { mensaje: errores.noEncontrado };
  const invalido = status === 422 ? zErrorCorreccionInvalida.safeParse(cuerpo) : null;
  if (!invalido?.success) return { mensaje: errores.generico };
  const { error, field } = invalido.data;
  return {
    ...(field !== undefined && { campo: field }),
    codigo: error,
    mensaje: textoDelError422({ error, field }),
  };
}

/** `POST …/corrections` del BFF. El navegador añade `Origin` y la cookie `SameSite=Strict`; un fallo de red es genérico. */
export async function enviarCorreccion(
  { pacienteId, dato, id }: RefDeDato,
  cuerpo: unknown,
): Promise<ResultadoDeCorreccion> {
  try {
    const respuesta = await fetch(`/api/patients/${pacienteId}/${dato}/${id}/corrections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      cache: 'no-store',
    });
    if (respuesta.status === 201) return { tipo: 'ok' };
    return {
      tipo: 'error',
      error: traducirError(respuesta.status, leerJson(await respuesta.text())),
    };
  } catch {
    return { tipo: 'error', error: { mensaje: mensajes().ficha.correccion.errores.generico } };
  }
}

/** `GET …/history` del BFF, validado con el Zod del contrato; cualquier otra cosa es un error sin detalle. */
export async function pedirHistorico({
  pacienteId,
  dato,
  id,
}: RefDeDato): Promise<ResultadoDeHistorico> {
  try {
    const respuesta = await fetch(`/api/patients/${pacienteId}/${dato}/${id}/history`, {
      cache: 'no-store',
    });
    const leido = zCorrectionHistory.safeParse(leerJson(await respuesta.text()));
    return respuesta.status === 200 && leido.success
      ? { tipo: 'ok', versiones: leido.data.items }
      : { tipo: 'error' };
  } catch {
    return { tipo: 'error' };
  }
}
