import type { Request, Response } from 'express';
import { rechazarNoEncontrado } from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import { traceIdDe } from '../../middleware/trace-id.middleware.js';
import { idDePacienteSchema } from '../patients/patients.schema.js';
import type { LecturaDeCuerpo } from './cuerpo-de-registro.js';
import { ValorFueraDeCatalogoError } from './errores-de-registro.js';
import {
  CUERPO_INVALIDO,
  rechazar,
  rechazoComunDe,
  registrarResultado,
  type Rechazo,
} from './http-escritura.js';
import { PacienteNoEncontradoError } from './pacientes.errores.js';

/*
 * Traducción HTTP común de los `POST /platform/patients/{id}/<registro>` del oncólogo (tratamiento previo, atributo):
 * valida el cuerpo, responde 201 `no-store`, traduce los errores de dominio y deja UNA línea de log sin datos clínicos.
 */

export interface DependenciasDelRegistro<S> {
  /** El service de UNA petición: recibe el `traceId` para que el log de la normalización lo lleve. */
  readonly servicioPara: (traceId: string) => S;
  readonly registrar: Registrar;
}

export interface OperacionDeRegistro<S, C, R> {
  readonly evento: string;
  readonly leerCuerpo: (cuerpo: unknown) => LecturaDeCuerpo<C>;
  readonly ejecutar: (servicio: S, solicitud: { patientId: string; cuerpo: C }) => Promise<R>;
  /** Etiquetas no clínicas del resultado para la línea de log (p. ej. `mappingStatus`); nunca textos del paciente. */
  readonly etiquetasDelLog?: (creado: R) => Readonly<Record<string, string>>;
  /** Errores de dominio propios de la operación → rechazo; `undefined` si no es uno de ellos. */
  readonly rechazoPropioDe?: (error: unknown) => Rechazo | undefined;
}

/** Rechazos comunes con su `field`: el valor fuera del catálogo nombra el campo que lo causó. */
function rechazoDeRegistro(error: unknown): Rechazo | undefined {
  const comun = rechazoComunDe(error);
  if (comun !== undefined && error instanceof ValorFueraDeCatalogoError) {
    return { ...comun, campo: error.campo };
  }
  return comun;
}

export function crearRegistroHttp<S, C, R>(
  dependencias: DependenciasDelRegistro<S>,
  operacion: OperacionDeRegistro<S, C, R>,
) {
  const { registrar, servicioPara } = dependencias;
  return async (request: Request, response: Response): Promise<void> => {
    const rechazarCon = (rechazo: Rechazo, patientId?: string): void =>
      rechazar(registrar, operacion.evento, response, rechazo, patientId);
    const patientId = idDePacienteSchema.safeParse(request.params['patientId']);
    const lectura = operacion.leerCuerpo(request.body);
    if (!lectura.valido) {
      rechazarCon(
        { ...CUERPO_INVALIDO, ...(lectura.campo !== undefined && { campo: lectura.campo }) },
        patientId.success ? patientId.data : undefined,
      );
      return;
    }
    if (!patientId.success) {
      rechazarNoEncontrado(response, registrar, operacion.evento);
      return;
    }
    try {
      const creado = await operacion.ejecutar(servicioPara(traceIdDe(response)), {
        patientId: patientId.data,
        cuerpo: lectura.cuerpo,
      });
      registrarResultado(
        registrar,
        operacion.evento,
        response,
        patientId.data,
        'ok',
        operacion.etiquetasDelLog?.(creado),
      );
      response.setHeader('Cache-Control', 'no-store');
      response.status(201).json(creado);
    } catch (error) {
      if (error instanceof PacienteNoEncontradoError) {
        rechazarNoEncontrado(response, registrar, operacion.evento);
        return;
      }
      const rechazo = operacion.rechazoPropioDe?.(error) ?? rechazoDeRegistro(error);
      if (rechazo === undefined) throw error;
      rechazarCon(rechazo, patientId.data);
    }
  };
}
