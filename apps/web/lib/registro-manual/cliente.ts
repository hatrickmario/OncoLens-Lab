import type { z } from 'zod';
import {
  zClinicalAttributeList,
  zErrorRegistroClinicoInvalido,
  zPriorTreatment,
} from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { mensajes } from '../mensajes';

export type AtributoPermitido = z.infer<typeof zClinicalAttributeList>['allowedAttributes'][number];

/** Error de un registro ya traducido al texto que ve el oncólogo; `campo` es la propiedad del cuerpo, si la hay. */
export interface ErrorDeRegistro {
  campo?: string;
  mensaje: string;
}

export type ResultadoDeRegistro =
  { tipo: 'ok'; creado: unknown } | { tipo: 'error'; error: ErrorDeRegistro };

export type LecturaDePermitidos =
  { tipo: 'ok'; permitidos: AtributoPermitido[] } | { tipo: 'error' };

export type RutaDeRegistro = 'prior-treatments' | 'clinical-attributes';

function leerJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

/** Texto fijo de un 422 por `error` y `field`; el `message` del servidor nunca se muestra (sin jerga ni eco de valores). */
function textoDelError422(error: string, campo: string | undefined): ErrorDeRegistro {
  const { errores } = mensajes().caso.registro;
  const sinCampo: Record<string, string> = {
    PACIENTE_EGRESADO: mensajes().ficha.correccion.egresado,
    TIPO_CANCER_NO_REGISTRADO: errores.sinTipoDeCancer,
  };
  const mensajeSinCampo = sinCampo[error];
  if (mensajeSinCampo !== undefined) return { mensaje: mensajeSinCampo };
  const mensaje =
    error === 'VALOR_FUERA_DE_CATALOGO' ? errores.valorFueraDeCatalogo : errores.campoInvalido;
  return campo ? { campo, mensaje } : { mensaje };
}

function traducirError(status: number, cuerpo: unknown): ErrorDeRegistro {
  const { errores } = mensajes().caso.registro;
  if (status === 403) return { mensaje: errores.permiso };
  if (status === 404) return { mensaje: errores.noEncontrado };
  const invalido = status === 422 ? zErrorRegistroClinicoInvalido.safeParse(cuerpo) : null;
  if (!invalido?.success) return { mensaje: errores.generico };
  return textoDelError422(invalido.data.error, invalido.data.field);
}

/** `POST …/{prior-treatments|clinical-attributes}` del BFF: el navegador añade `Origin` y la cookie `SameSite=Strict`. */
export async function enviarRegistro(
  pacienteId: string,
  ruta: RutaDeRegistro,
  cuerpo: unknown,
): Promise<ResultadoDeRegistro> {
  try {
    const respuesta = await fetch(`/api/patients/${pacienteId}/${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      cache: 'no-store',
    });
    const leido = leerJson(await respuesta.text());
    if (respuesta.status === 201) return { tipo: 'ok', creado: leido };
    return { tipo: 'error', error: traducirError(respuesta.status, leido) };
  } catch {
    return { tipo: 'error', error: { mensaje: mensajes().caso.registro.errores.generico } };
  }
}

/** El tratamiento recién creado quedó `no_mapeado` (RN-27): se avisa, sin bloquear y sin inventar un código. */
export function quedoSinCodigo(creado: unknown): boolean {
  const leido = zPriorTreatment.safeParse(creado);
  return leido.success && leido.data.mappingStatus === 'no_mapeado';
}

/** `GET …/clinical-attributes` del BFF: solo se usan los atributos permitidos del catálogo (RN-29), validados con el Zod del contrato. */
export async function pedirAtributosPermitidos(pacienteId: string): Promise<LecturaDePermitidos> {
  try {
    const respuesta = await fetch(`/api/patients/${pacienteId}/clinical-attributes`, {
      cache: 'no-store',
    });
    const leido = zClinicalAttributeList.safeParse(leerJson(await respuesta.text()));
    return respuesta.status === 200 && leido.success
      ? { tipo: 'ok', permitidos: leido.data.allowedAttributes }
      : { tipo: 'error' };
  } catch {
    return { tipo: 'error' };
  }
}
