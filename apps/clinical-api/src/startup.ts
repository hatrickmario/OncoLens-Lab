import {
  ConfiguracionInvalidaError,
  GateDeDatosRealesNoSuperado,
  cargarConfiguracion,
  cargarConfiguracionDeServicios,
  exigirGateDeDatosReales,
  validarTiposHabilitados,
  type ConfiguracionDeArranque,
  type ConfiguracionDeServicios,
} from './config/index.js';
import { SecretoAusenteError, loadRequiredSecrets, type LeerArchivo } from './config/secrets.js';
import {
  cargarClavesDeIdentidad,
  type ClavesDeIdentidad,
} from './infrastructure/crypto/claves-de-identidad.js';
import { crearProveedorDeCatalogo } from './modules/evidence-analysis/catalog-version.provider.js';
import type { TiposDeCancerHabilitados } from './modules/evidence-analysis/ports.js';
import { crearTiposHabilitados } from './modules/evidence-analysis/tipos-habilitados.js';
import {
  cargarConfiguracionDePii,
  type ConfiguracionDePii,
} from './modules/evidence-analysis/deidentification/pii-formats.config.js';

type Log = (linea: string) => void;

/** Lo que la etapa de servicios deja listo antes de escuchar: configuración, catálogo y claves de identidad. */
export interface ServiciosCargados {
  readonly configuracion: ConfiguracionDeServicios & { readonly pii: ConfiguracionDePii };
  readonly catalogo: ReturnType<typeof crearProveedorDeCatalogo>;
  readonly clavesDeIdentidad: ClavesDeIdentidad;
  /** `ENABLED_CANCER_TYPES` ya validada contra el `manifest.json` (US-043, RN-20). */
  readonly tiposHabilitados: TiposDeCancerHabilitados;
}

export interface DependenciasDeArranque<S> {
  readonly env: NodeJS.ProcessEnv;
  readonly readFile: LeerArchivo;
  readonly log: Log;
  readonly exit: (codigo: number) => void;
  /** Etapa 2 (archivos): su fallo se registra y termina igual que el de la etapa 1. */
  readonly cargarServicios: (
    env: NodeJS.ProcessEnv,
    readFile: LeerArchivo,
    arranque: ConfiguracionDeArranque,
  ) => S;
  readonly listen: (puerto: number, arranque: ConfiguracionDeArranque, servicios: S) => void;
}

/** Evento de arranque como una línea JSON (nivel, evento y campos sin valores de configuración ni identidad). */
export function registrarEventoDeArranque(
  log: Log,
  nivel: 'info' | 'error',
  evento: string,
  campos: Record<string, string | number> = {},
): void {
  log(JSON.stringify({ level: nivel, event: evento, ...campos }));
}

/**
 * Línea de log de una configuración inválida: nombra la variable, la regla y el motivo cerrado, nunca el valor (RN-10,
 * RN-14). Única excepción: `valorInvalido` de un enum no sensible, que el propio error ya filtró por forma (design D2).
 */
export function registrarConfiguracionInvalida(log: Log, error: ConfiguracionInvalidaError): void {
  registrarEventoDeArranque(log, 'error', 'configuracion_invalida', {
    variable: error.variable,
    regla: error.regla,
    motivo: error.motivo,
    ...(error.valorInvalido !== undefined && { valorInvalido: error.valorInvalido }),
  });
}

/** Un secreto requerido ausente, vacío o ilegible es una variable ausente: el mismo evento que cualquier configuración. */
function comoConfiguracionInvalida(error: SecretoAusenteError): ConfiguracionInvalidaError {
  return new ConfiguracionInvalidaError(
    error.variable,
    'es un secreto obligatorio, legible y no vacío',
    { motivo: 'variable_ausente' },
  );
}

/** Registra el fallo de arranque que conoce (configuración, secreto, gate de datos reales); cualquier otro se relanza. */
function registrarFalloDeArranque(log: Log, error: unknown): void {
  if (error instanceof SecretoAusenteError) {
    registrarConfiguracionInvalida(log, comoConfiguracionInvalida(error));
  } else if (error instanceof ConfiguracionInvalidaError) {
    registrarConfiguracionInvalida(log, error);
  } else if (error instanceof GateDeDatosRealesNoSuperado) {
    registrarEventoDeArranque(log, 'error', 'REAL_DATA_GATE_NOT_PASSED', {
      variable: error.variable,
    });
  } else {
    throw error;
  }
}

/**
 * Etapa 2: PostgreSQL, JWT de servicio, gateway de análisis y PII (con los archivos que leen), el catálogo con su
 * `manifest.json` (contra el que se validan los tipos de cáncer habilitados, US-043) y las claves de identidad ya parseadas en la etapa 1 (fallo cerrado, US-046 AC-5, RN-11).
 */
export function cargarEtapaDeServicios(
  env: NodeJS.ProcessEnv,
  readFile: LeerArchivo,
  arranque: ConfiguracionDeArranque,
): ServiciosCargados {
  const servicios = cargarConfiguracionDeServicios(env, readFile);
  const pii = cargarConfiguracionDePii(servicios.deidentificacion, readFile);
  const catalogo = crearProveedorDeCatalogo(
    servicios.analisis.catalogPath,
    readFile,
    servicios.analisis.catalogExpectedVersion,
  );
  const habilitados = validarTiposHabilitados(
    servicios.alcance.enabledCancerTypes,
    catalogo.cancerTypes(),
  );
  return {
    configuracion: { ...servicios, pii },
    catalogo,
    clavesDeIdentidad: cargarClavesDeIdentidad(arranque.identidad, readFile),
    tiposHabilitados: crearTiposHabilitados(habilitados),
  };
}

/**
 * Raíz de composición testable: comprueba los secretos, la configuración (etapas 1 y 2) y la guarda de datos reales
 * (RN-13) ANTES de escuchar (US-035 AC-5, US-037 AC-2/AC-3, fail-fast). Si algo falla registra un único evento —con
 * el nombre de la variable, nunca un valor, RN-10— y termina con código 1; el healthcheck del Compose ve el contenedor
 * sin escuchar y no lo da por healthy.
 */
export function arrancar<S>({
  env,
  readFile,
  log,
  exit,
  cargarServicios,
  listen,
}: DependenciasDeArranque<S>): void {
  let arranque: ConfiguracionDeArranque;
  let servicios: S;
  try {
    loadRequiredSecrets(env, readFile);
    arranque = cargarConfiguracion(env);
    exigirGateDeDatosReales(arranque.datosReales);
    servicios = cargarServicios(env, readFile, arranque);
  } catch (error) {
    registrarFalloDeArranque(log, error);
    exit(1);
    return;
  }
  listen(arranque.puerto, arranque, servicios);
}
