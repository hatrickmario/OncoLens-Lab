import { ConfiguracionInvalidaError, readPort } from './config.js';
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
 * el healthcheck del Compose ve el contenedor sin escuchar y no lo da por healthy. Un puerto inválido se registra
 * igual, como `configuracion_invalida` con la variable.
 */
export function arrancar({ env, readFile, log, exit, listen }: DependenciasDeArranque): void {
  let puerto: number;
  try {
    loadRequiredSecrets(env, readFile);
    puerto = readPort(env);
  } catch (error) {
    if (error instanceof SecretoAusenteError) {
      log(JSON.stringify({ level: 'error', event: 'secreto_ausente', variable: error.variable }));
    } else if (error instanceof ConfiguracionInvalidaError) {
      log(
        JSON.stringify({
          level: 'error',
          event: 'configuracion_invalida',
          variable: error.variable,
        }),
      );
    } else {
      throw error;
    }
    exit(1);
    return;
  }
  listen(puerto);
}
