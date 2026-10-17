import type { ConfiguracionDelSeed } from './config.js';

/** El seed se negó a correr (RN-13). El mensaje nombra la variable, nunca un valor. */
export class SeedBloqueadoError extends Error {
  constructor(
    readonly variable: string,
    motivo: string,
  ) {
    super(`El seed no corre: ${variable} ${motivo}`);
    this.name = 'SeedBloqueadoError';
  }
}

export type EntradaDeLaGuarda = Pick<
  ConfiguracionDelSeed,
  'appEnv' | 'entornosPermitidos' | 'realAnonymizedEnabled' | 'realIdentifiedEnabled'
>;

/**
 * Guarda de entorno del seed (RN-13). Pura: decide con la configuración ya leída, antes de crear el cliente de la
 * base. Un entorno con datos reales habilitados nunca recibe datos `seed`.
 */
export function assertSeedPermitido(_config: EntradaDeLaGuarda): void {
  throw new Error('no implementado');
}
