import type { AlmacenDeDocumentos } from '../modules/documents/ports.js';

export interface ConfiguracionDelAlmacen {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  timeoutMs: number;
}

export interface AlmacenMinio extends AlmacenDeDocumentos {
  /** Crea el bucket si no existe (idempotente). */
  asegurarBucket(): Promise<void>;
}

export function crearAlmacenMinio(_config: ConfiguracionDelAlmacen): AlmacenMinio {
  return {
    guardar: () => {
      throw new Error('no implementado');
    },
    borrar: () => {
      throw new Error('no implementado');
    },
    asegurarBucket: () => {
      throw new Error('no implementado');
    },
  };
}
