import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  ConversacionNoEncontradaError,
  type ConversationService,
} from '../../modules/evidence-analysis/conversation/conversation.service.js';
import type { CapturadorDeTurnos } from './capturador.js';
import {
  HechoEsperadoNoEncontradoError,
  identidadSinteticaDelPaciente,
  resolverMarcadorDeIdentidad,
  traducirHechosEsperados,
} from './reglas.js';

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

/** Un caso no se pudo preparar; el mensaje nombra el caso y la clave, nunca la pregunta ni datos del paciente. */
export class CasoNoPreparableError extends Error {
  constructor(
    readonly casoId: string,
    motivo: string,
  ) {
    super(`caso ${casoId}: ${motivo}`);
    this.name = 'CasoNoPreparableError';
  }
}

interface ArchivoPreparado {
  casoId: string;
  contenido: { peticion: unknown; hechosPorClave: Record<string, string>; identidad: string[] };
}

/** El primer turno de una conversación nueva del paciente del caso: devuelve el cuerpo capturado y los enlaces de sus hechos. */
async function turnoDelCaso(entradas: EntradasDeLaPreparacion, caso: CasoParaPreparar) {
  const { servicio, usuarioId } = entradas;
  const patientId = entradas.idDelPaciente(caso.paciente);
  const { conversationId } = await servicio.abrir({ patientId, userId: usuarioId });
  const turno = await servicio.crearTurno({
    traceId: entradas.trazador(),
    userId: usuarioId,
    conversationId,
    peticion: { question: resolverMarcadorDeIdentidad(caso.pregunta) },
  });
  if (turno.tipo === 'fallo') {
    throw new CasoNoPreparableError(caso.id, `el turno terminó con ${turno.respuesta.codigo}`);
  }
  return { peticion: entradas.capturador.ultimaPeticion(), enlaces: turno.cuerpo.dataLinks };
}

async function prepararCaso(
  entradas: EntradasDeLaPreparacion,
  caso: CasoParaPreparar,
): Promise<ArchivoPreparado> {
  try {
    const { peticion, enlaces } = await turnoDelCaso(entradas, caso);
    return {
      casoId: caso.id,
      contenido: {
        peticion,
        hechosPorClave: traducirHechosEsperados(caso.hechosEsperados, enlaces),
        identidad: [...identidadSinteticaDelPaciente(caso.paciente)],
      },
    };
  } catch (error) {
    if (error instanceof ConversacionNoEncontradaError) {
      throw new CasoNoPreparableError(caso.id, `el seed no tiene el paciente ${caso.paciente}`);
    }
    if (error instanceof HechoEsperadoNoEncontradoError) {
      throw new CasoNoPreparableError(caso.id, error.message);
    }
    throw error;
  }
}

/**
 * Arma con el servicio de producción la petición de cada caso y control y las escribe en `directorioDeSalida`. Todas se
 * arman antes de escribir la primera: si un caso falla no queda un conjunto parcial. Cada caso es el primer turno de su
 * propia conversación, con su propio seudónimo (RN-11).
 */
export async function prepararPeticiones(entradas: EntradasDeLaPreparacion): Promise<void> {
  const preparados: ArchivoPreparado[] = [];
  for (const caso of entradas.casos) preparados.push(await prepararCaso(entradas, caso));
  mkdirSync(entradas.directorioDeSalida, { recursive: true });
  for (const { casoId, contenido } of preparados) {
    const ruta = path.join(entradas.directorioDeSalida, `${casoId}.json`);
    writeFileSync(ruta, `${JSON.stringify(contenido, null, 2)}\n`, 'utf8');
  }
}
