import {
  zErrorDiagnosticoInvalido,
  zErrorRegistroManualInvalido,
} from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { mensajes } from '../mensajes';

/** Error de un registro ya traducido al texto que ve el oncólogo; `campo` es la propiedad del cuerpo, si la hay. */
export interface ErrorDeRegistro {
  campo?: string;
  mensaje: string;
  /** Código `error` del servidor (`CUERPO_INVALIDO`…), si el registro lo trae; no se muestra. */
  codigo?: string;
}

/** Campo de escala funcional cuyo rango fija el catálogo por escala (mensaje propio, D2). */
const CAMPO_DE_RANGO = 'performanceValue';

function textoDelError422(error: string, campo: string | undefined): ErrorDeRegistro {
  const { errores } = mensajes().registroManual;
  if (error === 'PACIENTE_EGRESADO') return { mensaje: errores.egresado };
  if (error === 'GRADACION_INCOHERENTE') {
    return campo ? { campo, mensaje: errores.gradacionIncoherente } : { mensaje: errores.generico };
  }
  const mensaje =
    error !== 'VALOR_FUERA_DE_CATALOGO'
      ? errores.campoInvalido
      : campo === CAMPO_DE_RANGO
        ? errores.valorFueraDeRango
        : errores.valorFueraDeCatalogo;
  return campo ? { campo, mensaje } : { mensaje: errores.generico };
}

/**
 * Texto fijo del error de un registro de biomarcador o diagnóstico (`403`, `404`, `422` con o sin `field`, y cualquier
 * otro estado como genérico). El `message` del servidor nunca se muestra: la UI usa su texto por código y campo (D9).
 */
export function errorDelServidor(status: number, cuerpo: unknown): ErrorDeRegistro {
  const { errores } = mensajes().registroManual;
  if (status === 403) return { mensaje: errores.permiso };
  if (status === 404) return { mensaje: errores.noEncontrado };
  const invalido =
    status === 422
      ? zErrorRegistroManualInvalido.or(zErrorDiagnosticoInvalido).safeParse(cuerpo)
      : null;
  if (!invalido?.success) return { mensaje: errores.generico };
  return textoDelError422(invalido.data.error, invalido.data.field);
}
