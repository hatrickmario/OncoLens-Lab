import type { ConversationService } from '../../modules/evidence-analysis/conversation/conversation.service.js';
import type { CapturadorDeTurnos } from './capturador.js';

/** Un caso o control de `chat-v1` listo para prepararse: su paciente ya es la clave del seed. */
export interface CasoParaPreparar {
  id: string;
  cancer: string;
  paciente: string;
  pregunta: string;
  /** Claves del seed (`<paciente>/<recurso>`); vacío en los controles. */
  hechosEsperados: readonly string[];
}

export interface EntradasDeLaPreparacion {
  casos: readonly CasoParaPreparar[];
  servicio: ConversationService;
  capturador: CapturadorDeTurnos;
  usuarioId: string;
  idDelPaciente: (clave: string) => string;
  directorioDeSalida: string;
  /** `traceId` de cada turno: generador inyectado (CLAUDE.md, determinismo). */
  trazador: () => string;
}

/** Arma con el servicio de producción la petición de cada caso y control y las escribe en `directorioDeSalida`. */
export function prepararPeticiones(_entradas: EntradasDeLaPreparacion): Promise<void> {
  return Promise.reject(new Error('no implementado'));
}
