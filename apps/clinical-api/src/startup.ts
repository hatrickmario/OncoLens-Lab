import { readPort } from './config.js';
import { SecretoAusenteError, loadRequiredSecrets, type LeerArchivo } from './config/secrets.js';

export interface DependenciasDeArranque {
  readonly env: NodeJS.ProcessEnv;
  readonly readFile: LeerArchivo;
  readonly log: (linea: string) => void;
  readonly exit: (codigo: number) => void;
  readonly listen: (puerto: number) => void;
}

/**
 * Raíz de composición testable: comprueba los secretos ANTES de escuchar (US-035 AC-5, fail-fast). Si falta uno,
 * registra el evento `secreto_ausente` con el nombre de la variable —nunca un valor, RN-10— y termina con código 1;
 * el healthcheck del Compose ve el contenedor sin escuchar y no lo da por healthy.
 */
export function arrancar({ env, readFile, log, exit, listen }: DependenciasDeArranque): void {
  try {
    loadRequiredSecrets(env, readFile);
  } catch (error) {
    if (!(error instanceof SecretoAusenteError)) throw error;
    log(JSON.stringify({ level: 'error', event: 'secreto_ausente', variable: error.variable }));
    exit(1);
    return;
  }
  listen(readPort(env));
}
