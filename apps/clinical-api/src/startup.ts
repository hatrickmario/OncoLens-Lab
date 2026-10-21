import { ConfiguracionInvalidaError, readIdentityKeyConfig, readPort } from './config.js';
import { SecretoAusenteError, loadRequiredSecrets, type LeerArchivo } from './config/secrets.js';

export interface DependenciasDeArranque {
  readonly env: NodeJS.ProcessEnv;
  readonly readFile: LeerArchivo;
  readonly log: (linea: string) => void;
  readonly exit: (codigo: number) => void;
  readonly listen: (puerto: number) => void;
}

/** Línea de log de una configuración inválida: nombra la variable, nunca su valor (RN-10, RN-14). */
export function registrarConfiguracionInvalida(
  log: (linea: string) => void,
  error: ConfiguracionInvalidaError,
): void {
  log(
    JSON.stringify({ level: 'error', event: 'configuracion_invalida', variable: error.variable }),
  );
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
    readIdentityKeyConfig(env);
    puerto = readPort(env);
  } catch (error) {
    if (error instanceof SecretoAusenteError) {
      log(JSON.stringify({ level: 'error', event: 'secreto_ausente', variable: error.variable }));
    } else if (error instanceof ConfiguracionInvalidaError) {
      registrarConfiguracionInvalida(log, error);
    } else {
      throw error;
    }
    exit(1);
    return;
  }
  listen(puerto);
}
