import type { ErrorRequestHandler, Request, Response } from 'express';
import {
  enviarError,
  esErrorDeCuerpoDelCliente,
  type CodigoDeError,
} from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import { traceIdDe } from '../../middleware/trace-id.middleware.js';
import type { SesionAutenticada } from '../auth/auth.service.js';
import { PacienteEgresadoError, ValorFueraDeCatalogoError } from './errores-de-registro.js';

/*
 * Traducción HTTP común de las escrituras clínicas del oncólogo (registro manual y corrección): un error de dominio se
 * vuelve un rechazo con su código, su `resultado` de log y, si es de un campo, el NOMBRE del campo (nunca su valor).
 */

export interface Rechazo {
  readonly status: number;
  readonly codigo: CodigoDeError;
  /** Valor de `resultado` de la línea de log. */
  readonly resultado: string;
  /** `field` del contrato: nombre de la propiedad del cuerpo que causó el error. */
  readonly campo?: string;
}

export const CUERPO_INVALIDO: Rechazo = {
  status: 422,
  codigo: 'CUERPO_INVALIDO',
  resultado: 'cuerpo_invalido',
};

/** El 422 de un cuerpo que no cumple el contrato, con el NOMBRE del campo cuando se sabe cuál es. */
export function cuerpoInvalidoDelCampo(campo: string | undefined): Rechazo {
  return { ...CUERPO_INVALIDO, ...(campo !== undefined && { campo }) };
}

/**
 * Los rechazos que toda escritura clínica comparte: paciente egresado (RN-17) y valor fuera del catálogo (RN-27). El
 * `campo` lo añade quien lo declara en su contrato (la corrección hoy; el registro manual con l1d-80).
 */
export function rechazoComunDe(error: unknown): Rechazo | undefined {
  if (error instanceof PacienteEgresadoError) {
    return { status: 422, codigo: 'PACIENTE_EGRESADO', resultado: 'paciente_egresado' };
  }
  if (error instanceof ValorFueraDeCatalogoError) {
    return { status: 422, codigo: 'VALOR_FUERA_DE_CATALOGO', resultado: 'valor_fuera_de_catalogo' };
  }
  return undefined;
}

/** El guard de sesión corre antes que el router: sin sesión es un montaje roto, no un error del cliente. */
export function sesionDe(request: Request, modulo: string): SesionAutenticada {
  if (request.sesion === undefined) throw new Error(`${modulo} montado sin el guard de sesión`);
  return request.sesion;
}

/** Línea de log: evento, resultado, `traceId`, `patientId` (UUID) y las etiquetas no clínicas que declare quien llama (p. ej. `mappingStatus`); nunca el cuerpo ni sus valores (RN-10). */
export function registrarResultado(
  registrar: Registrar,
  evento: string,
  response: Response,
  patientId: string | undefined,
  resultado: string,
  etiquetas: Readonly<Record<string, string>> = {},
): void {
  registrar({
    event: evento,
    resultado,
    traceId: traceIdDe(response),
    ...(patientId !== undefined && { patientId }),
    ...etiquetas,
  });
}

/** Responde el rechazo y deja su línea de log. */
export function rechazar(
  registrar: Registrar,
  evento: string,
  response: Response,
  rechazo: Rechazo,
  patientId?: string,
): void {
  registrarResultado(registrar, evento, response, patientId, rechazo.resultado);
  enviarError(response, rechazo.status, rechazo.codigo, traceIdDe(response), rechazo.campo);
}

/** JSON malformado o cuerpo excesivo: el mismo 422 del contrato, sin eco del error del parser. */
export function crearCuerpoIlegible(registrar: Registrar, evento: string): ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    if (!esErrorDeCuerpoDelCliente(error)) {
      next(error);
      return;
    }
    rechazar(registrar, evento, response, CUERPO_INVALIDO);
  };
}
