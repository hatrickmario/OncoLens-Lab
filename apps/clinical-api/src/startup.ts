import {
  ConfiguracionInvalidaError,
  GateDeDatosRealesNoSuperado,
  cargarConfiguracion,
  exigirGateDeDatosReales,
  type ConfiguracionDeArranque,
} from './config/index.js';
import { SecretoAusenteError, loadRequiredSecrets, type LeerArchivo } from './config/secrets.js';

export interface DependenciasDeArranque {
  readonly env: NodeJS.ProcessEnv;
  readonly readFile: LeerArchivo;
  readonly log: (linea: string) => void;
  readonly exit: (codigo: number) => void;
  readonly listen: (puerto: number, configuracion: ConfiguracionDeArranque) => void;
}

/**
 * Línea de log de una configuración inválida: nombra la variable, la regla y el motivo cerrado, nunca el valor (RN-10,
 * RN-14). Única excepción: `valorInvalido` de un enum no sensible, que el propio error ya filtró por forma (design D2).
 */
export function registrarConfiguracionInvalida(
  log: (linea: string) => void,
  error: ConfiguracionInvalidaError,
): void {
  log(
    JSON.stringify({
      level: 'error',
      event: 'configuracion_invalida',
      variable: error.variable,
      regla: error.regla,
      motivo: error.motivo,
      ...(error.valorInvalido !== undefined && { valorInvalido: error.valorInvalido }),
    }),
  );
}

/** Registra el fallo de arranque que conoce (secreto, configuración, gate de datos reales); cualquier otro se relanza. */
function registrarFalloDeArranque(log: (linea: string) => void, error: unknown): void {
  if (error instanceof SecretoAusenteError) {
    log(JSON.stringify({ level: 'error', event: 'secreto_ausente', variable: error.variable }));
  } else if (error instanceof ConfiguracionInvalidaError) {
    registrarConfiguracionInvalida(log, error);
  } else if (error instanceof GateDeDatosRealesNoSuperado) {
    log(
      JSON.stringify({
        level: 'error',
        event: 'REAL_DATA_GATE_NOT_PASSED',
        variable: error.variable,
      }),
    );
  } else {
    throw error;
  }
}

/**
 * Raíz de composición testable: comprueba los secretos, la configuración de la etapa 1 y la guarda de datos reales
 * (RN-13) ANTES de escuchar (US-035 AC-5, US-037 AC-2/AC-3, fail-fast). Si algo falla registra un único evento —con
 * el nombre de la variable, nunca un valor, RN-10— y termina con código 1; el healthcheck del Compose ve el contenedor
 * sin escuchar y no lo da por healthy.
 */
export function arrancar({ env, readFile, log, exit, listen }: DependenciasDeArranque): void {
  let configuracion: ConfiguracionDeArranque;
  try {
    loadRequiredSecrets(env, readFile);
    configuracion = cargarConfiguracion(env);
    exigirGateDeDatosReales(configuracion.datosReales);
  } catch (error) {
    registrarFalloDeArranque(log, error);
    exit(1);
    return;
  }
  listen(configuracion.puerto, configuracion);
}
