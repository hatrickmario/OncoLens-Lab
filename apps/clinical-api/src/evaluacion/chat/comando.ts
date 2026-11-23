import type { ConversationService } from '../../modules/evidence-analysis/conversation/conversation.service.js';
import type { CapturadorDeTurnos } from './capturador.js';

export const SALIDA_OK = 0;
export const SALIDA_FALLO = 1;
export const SALIDA_USO = 2;

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
  componerServicio: (base: BaseParaPreparar) => Promise<ServicioParaPreparar>;
  trazador: () => string;
}

/** `npm run eval:chat-preparar`: devuelve el código de salida del proceso. */
export function ejecutarComandoPreparar(
  _argumentos: string[],
  _dependencias: DependenciasDelComando,
): Promise<number> {
  return Promise.reject(new Error('no implementado'));
}
