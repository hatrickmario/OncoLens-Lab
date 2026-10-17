import type { ConfiguracionDelSeed } from './config.js';

/** Nombre del entorno de datos reales (readme §6.1 #2): el único que ninguna configuración puede permitir. */
const ENTORNO_PILOTO = 'piloto';

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
export function assertSeedPermitido(config: EntradaDeLaGuarda): void {
  if (config.realAnonymizedEnabled) {
    throw new SeedBloqueadoError(
      'REAL_ANONYMIZED_ENABLED',
      'está en true (datos reales habilitados)',
    );
  }
  if (config.realIdentifiedEnabled) {
    throw new SeedBloqueadoError(
      'REAL_IDENTIFIED_ENABLED',
      'está en true (datos reales habilitados)',
    );
  }
  if (config.appEnv === undefined) {
    throw new SeedBloqueadoError(
      'APP_ENV',
      'no está definida (no se presume un entorno permitido)',
    );
  }
  // `piloto` se rechaza siempre y sin distinguir mayúsculas: ninguna lista de configuración lo habilita (RN-13).
  const entorno = config.appEnv.toLowerCase();
  if (entorno === ENTORNO_PILOTO) {
    throw new SeedBloqueadoError('APP_ENV', 'es piloto (entorno de datos reales)');
  }
  if (!config.entornosPermitidos.some((permitido) => permitido.toLowerCase() === entorno)) {
    throw new SeedBloqueadoError('APP_ENV', 'no está en SEED_ALLOWED_ENVS');
  }
}

/** `piloto` sin distinguir mayúsculas: el entorno de datos reales que ninguna lista de configuración habilita. */
export function esEntornoPiloto(_appEnv: string): boolean {
  throw new Error('no implementado');
}
