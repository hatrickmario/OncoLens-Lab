import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { enviarError } from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import { traceIdDe } from '../../middleware/trace-id.middleware.js';
import type { UbicadorDePaciente } from './opt-outs.repository.js';
import type { OptOutService } from './opt-outs.service.js';
import {
  rutaGeneraIA,
  type FabricaDeGuardiaDeOptOut,
  type OrigenDelPacienteDeLaRuta,
} from './rutas-genera-ia.js';

export interface DependenciasDelGuardia {
  optOuts: OptOutService;
  ubicador: UbicadorDePaciente;
  registrar: Registrar;
}

const EVENTO = 'opt_out.guardia';

/** Un identificador que no es UUID no puede existir: el guardia deja pasar para que el handler responda su 400/404. */
export const comoUuid = (valor: unknown): string | null => {
  const resultado = z.uuid().safeParse(valor);
  return resultado.success ? resultado.data : null;
};

type ResolverPaciente = (request: Request) => Promise<string | null>;

function resolverPacienteDe(
  origen: OrigenDelPacienteDeLaRuta,
  ubicador: UbicadorDePaciente,
): ResolverPaciente {
  const { fuente, parametro } = origen;
  const idDelParametro = (request: Request): string | null =>
    parametro === null ? null : comoUuid(request.params[parametro]);
  switch (fuente) {
    case 'cuerpo':
      return (request) =>
        Promise.resolve(comoUuid((request.body as { patientId?: unknown } | undefined)?.patientId));
    case 'analisis':
      return async (request) => {
        const analysisId = idDelParametro(request);
        return analysisId === null ? null : ubicador.pacienteDelAnalisis(analysisId);
      };
    case 'conversacion':
      return async (request) => {
        const conversationId = idDelParametro(request);
        return conversationId === null ? null : ubicador.pacienteDeLaConversacion(conversationId);
      };
  }
}

/**
 * Guardia de opt-out de `analisis_ia` (RN-15, US-148): se monta tras la sesión y el RBAC y antes de cualquier llamada a
 * `rag-orchestrator` o escritura de registros de IA. Lee la marca una sola vez al entrar la petición (design D4). Si
 * el consentimiento no está disponible responde `403 OPT_OUT_ANALISIS_IA` sin referencia, motivo ni causa; el log lleva
 * `traceId`, UUID del paciente, `operationId` y `motivo` (nunca la referencia ni el motivo de la marca, RN-10). Falla
 * cerrado: un error al leer la marca llega al manejador final y responde 500 sin llamar a la IA.
 */
export function crearFabricaDeGuardiaDeOptOut(
  dependencias: DependenciasDelGuardia,
): FabricaDeGuardiaDeOptOut {
  const { optOuts, ubicador, registrar } = dependencias;
  return (operationId) => {
    const entrada = rutaGeneraIA(operationId);
    const resolverPaciente = resolverPacienteDe(entrada.origenDelPaciente, ubicador);
    const guardia: RequestHandler = async (request, response, siguiente) => {
      try {
        const patientId = await resolverPaciente(request);
        const consentimiento =
          patientId === null ? null : await optOuts.consentimientoIA(patientId);
        if (patientId === null || consentimiento === null || consentimiento === 'disponible') {
          siguiente();
          return;
        }
        const traceId = traceIdDe(response);
        registrar({
          event: EVENTO,
          resultado: 'opt_out_analisis_ia',
          traceId,
          patientId,
          operationId,
          motivo: consentimiento,
        });
        enviarError(response, 403, 'OPT_OUT_ANALISIS_IA', traceId);
      } catch (error) {
        siguiente(error);
      }
    };
    return guardia;
  };
}
