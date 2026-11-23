import { rmSync } from 'node:fs';
import { ConfiguracionInvalidaError } from '../../config/index.js';
import { claseDeError } from '../../infrastructure/logger.js';
import { idSembrado } from '../../../prisma/seed/determinismo.js';
import { leerConfiguracionDelSeed } from '../../../prisma/seed/config.js';
import { SeedBloqueadoError, assertSeedPermitido } from '../../../prisma/seed/guarda.js';
import type { ConversationService } from '../../modules/evidence-analysis/conversation/conversation.service.js';
import type { CapturadorDeTurnos } from './capturador.js';
import { cargarCasosDelChat, DatasetDeChatInvalidoError } from './dataset.js';
import { BaseNoSinteticaError, exigirBaseDeTestSintetica } from './guarda-de-base.js';
import { CasoNoPreparableError, prepararPeticiones } from './preparar-peticiones.js';

export const SALIDA_OK = 0;
export const SALIDA_FALLO = 1;
export const SALIDA_USO = 2;

const USO = 'uso: eval:chat-preparar (sin argumentos; el directorio de salida está fijado)\n';

/** Lo mínimo que la preparación necesita de la base: consultar y cerrar. */
export interface BaseParaPreparar {
  consultar(sql: string, valores?: unknown[]): Promise<{ rows: unknown[] }>;
  cerrar(): Promise<void>;
}

export interface ServicioParaPreparar {
  servicio: ConversationService;
  capturador: CapturadorDeTurnos;
  usuarioId: string;
}

export interface DependenciasDelComando {
  raizDelRepo: string;
  entorno: NodeJS.ProcessEnv;
  /** Directorio de las peticiones: el comando lo vacía al arrancar y lo reescribe completo o no lo escribe. */
  directorioDeSalida: string;
  stdout: (texto: string) => void;
  stderr: (texto: string) => void;
  abrirBase: () => Promise<BaseParaPreparar>;
  /** Compone el servicio de conversación: es lo que abre las claves de identidad, así que va después de las guardas. */
  componerServicio: () => Promise<ServicioParaPreparar>;
  trazador: () => string;
}

/** RN-13: la guarda del seed (entorno permitido, sin `REAL_*_ENABLED`, nunca `piloto`) con la configuración del entorno. */
function exigirEntornoSinDatosReales(entorno: NodeJS.ProcessEnv): void {
  assertSeedPermitido(leerConfiguracionDelSeed(entorno));
}

/** Cuerpo de cada fallo conocido: nombra la variable, el caso o la condición; nunca valores ni datos clínicos. */
function mensajeDelFallo(error: unknown): string {
  if (error instanceof ConfiguracionInvalidaError)
    return `configuración inválida: ${error.variable}`;
  if (
    error instanceof SeedBloqueadoError ||
    error instanceof BaseNoSinteticaError ||
    error instanceof DatasetDeChatInvalidoError ||
    error instanceof CasoNoPreparableError
  ) {
    return error.message;
  }
  // Solo la clase del error: su mensaje puede traer texto de la pregunta o de la identidad (RN-10).
  return `la preparación de peticiones falló (${claseDeError(error)})`;
}

/**
 * `npm run eval:chat-preparar` (US-269, L1D-326): devuelve el código de salida del proceso. Orden fijo, de lo más barato a
 * lo más sensible: 1) borra el residuo de una corrida interrumpida, 2) guarda de entorno y de datos reales (RN-13),
 * 3) guarda de base de test sintética, 4) recién entonces compone el servicio (que abre las claves de identidad) y escribe.
 */
export async function ejecutarComandoPreparar(
  argumentos: string[],
  dependencias: DependenciasDelComando,
): Promise<number> {
  if (argumentos.length > 0) {
    dependencias.stderr(USO);
    return SALIDA_USO;
  }
  rmSync(dependencias.directorioDeSalida, { recursive: true, force: true });
  let base: BaseParaPreparar | null = null;
  try {
    exigirEntornoSinDatosReales(dependencias.entorno);
    const casos = cargarCasosDelChat(dependencias.raizDelRepo);
    base = await dependencias.abrirBase();
    await exigirBaseDeTestSintetica(base);
    const { servicio, capturador, usuarioId } = await dependencias.componerServicio();
    await prepararPeticiones({
      casos,
      servicio,
      capturador,
      usuarioId,
      idDelPaciente: idSembrado,
      directorioDeSalida: dependencias.directorioDeSalida,
      trazador: dependencias.trazador,
    });
    dependencias.stdout(`peticiones preparadas: ${casos.length}\n`);
    return SALIDA_OK;
  } catch (error) {
    dependencias.stderr(`${mensajeDelFallo(error)}\n`);
    return SALIDA_FALLO;
  } finally {
    await base?.cerrar();
  }
}
