import express, { Router, type Request, type Response } from 'express';
import { rechazarNoEncontrado } from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { TraceIdGenerator } from '../../infrastructure/trace-id-generator.js';
import { authorize } from '../../middleware/authorize.js';
import { crearTraceIdMiddleware } from '../../middleware/trace-id.middleware.js';
import {
  crearCuerpoIlegible,
  registrarResultado,
  type Rechazo,
} from '../compartido/http-escritura.js';
import { PacienteNoEncontradoError } from '../compartido/pacientes.errores.js';
import { crearRegistroHttp } from '../compartido/registro-http.js';
import { idDePacienteSchema } from '../patients/patients.schema.js';
import { TipoDeCancerNoRegistradoError } from './clinical-attributes.errores.js';
import { leerCuerpoDeAtributo } from './clinical-attributes.schema.js';
import type { ClinicalAttributesService } from './clinical-attributes.service.js';

export interface DependenciasDelController {
  servicio: ClinicalAttributesService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

const EVENTO_REGISTRO = 'clinical_attributes.registro';
const EVENTO_LECTURA = 'clinical_attributes.lectura';

const TIPO_DE_CANCER_NO_REGISTRADO: Rechazo = {
  status: 422,
  codigo: 'TIPO_CANCER_NO_REGISTRADO',
  resultado: 'tipo_cancer_no_registrado',
};

/** Errores de dominio propios del atributo → respuesta HTTP; `undefined` si no es uno de ellos. */
function rechazoPropioDe(error: unknown): Rechazo | undefined {
  return error instanceof TipoDeCancerNoRegistradoError ? TIPO_DE_CANCER_NO_REGISTRADO : undefined;
}

function crearLectura({ servicio, registrar }: DependenciasDelController) {
  return async (request: Request, response: Response): Promise<void> => {
    const patientId = idDePacienteSchema.safeParse(request.params['patientId']);
    if (!patientId.success) {
      rechazarNoEncontrado(response, registrar, EVENTO_LECTURA);
      return;
    }
    try {
      const lista = await servicio.listarAtributos(patientId.data);
      registrarResultado(registrar, EVENTO_LECTURA, response, patientId.data, 'ok');
      response.setHeader('Cache-Control', 'no-store');
      response.status(200).json(lista);
    } catch (error) {
      if (!(error instanceof PacienteNoEncontradoError)) throw error;
      rechazarNoEncontrado(response, registrar, EVENTO_LECTURA);
    }
  };
}

/**
 * `POST` y `GET /platform/patients/{id}/clinical-attributes` (se montan bajo `/platform`, detrás del guard). Solo
 * traducen HTTP ↔ service: `authorize` corre antes de leer el cuerpo (403 sin efectos) y el log nunca lleva claves ni
 * valores.
 */
export function clinicalAttributesController(dependencias: DependenciasDelController): Router {
  const router = Router();
  const conTraceId = crearTraceIdMiddleware(dependencias.traceIds);
  router.get(
    '/patients/:patientId/clinical-attributes',
    conTraceId,
    authorize('clinical:read'), // x-permission de listClinicalAttributes
    crearLectura(dependencias),
  );
  router.post(
    '/patients/:patientId/clinical-attributes',
    conTraceId,
    authorize('clinical:write'), // x-permission de createManualClinicalAttribute
    express.json(),
    crearRegistroHttp(
      { servicioPara: () => dependencias.servicio, registrar: dependencias.registrar },
      {
        evento: EVENTO_REGISTRO,
        leerCuerpo: leerCuerpoDeAtributo,
        ejecutar: (servicio, solicitud) => servicio.registrarAtributo(solicitud),
        rechazoPropioDe,
      },
    ),
    crearCuerpoIlegible(dependencias.registrar, EVENTO_REGISTRO),
  );
  return router;
}
