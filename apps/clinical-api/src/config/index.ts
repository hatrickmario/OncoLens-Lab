import {
  ConfiguracionInvalidaError,
  exigirAppEnv,
  leerBooleano,
  readAuthConfig,
  readDatabaseConfig,
  readDeidentificationConfig,
  readEvidenceAnalysisConfig,
  readIdentityKeyConfig,
  readPort,
  readPositiveInteger,
  readServiceJwtConfig,
  type AuthConfig,
  type DatabaseConfig,
  type DeidentificationConfig,
  type EvidenceAnalysisConfig,
  type IdentityKeyConfig,
  type ServiceJwtConfig,
} from './secciones.js';

/**
 * Único módulo que lee el entorno de `clinical-api` (US-037, RN-22): cada sección valida sus variables y falla con
 * `ConfiguracionInvalidaError` (variable, regla, motivo; nunca el valor). Fuera de él, nadie toca `process.env`;
 * solo la raíz de composición (`server.ts`) le pasa el entorno.
 */
export * from './secciones.js';

/** Inactividad máxima de la sesión (RN-22). Lo aplica el guard de L1D-198; aquí solo se valida. */
export interface SesionConfig {
  idleMinutes: number;
}

const DEFAULT_SESSION_IDLE_MINUTES = 30;

export function readSesionConfig(env: NodeJS.ProcessEnv): SesionConfig {
  return {
    idleMinutes: readPositiveInteger(env, 'SESSION_IDLE_MINUTES', DEFAULT_SESSION_IDLE_MINUTES),
  };
}

/** Campos que se añaden a la lista cerrada del logger (RN-10, RN-22): solo suma, nunca resta. */
export interface LogsConfig {
  camposSensiblesExtra: readonly string[];
}

const FORMA_DE_CAMPO_DE_LOG = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

/** `LOG_REDACT_EXTRA_FIELDS`: nombres separados por comas; un nombre malformado nombra la variable, no el valor. */
export function readLogsConfig(env: NodeJS.ProcessEnv): LogsConfig {
  const variable = 'LOG_REDACT_EXTRA_FIELDS';
  const nombres = (env[variable] ?? '')
    .split(',')
    .map((nombre) => nombre.trim())
    .filter((nombre) => nombre !== '');
  if (!nombres.every((nombre) => FORMA_DE_CAMPO_DE_LOG.test(nombre))) {
    throw new ConfiguracionInvalidaError(
      variable,
      'debe ser una lista de nombres de campo separados por comas',
    );
  }
  return { camposSensiblesExtra: nombres };
}

export interface DatosRealesConfig {
  anonymizedEnabled: boolean;
  identifiedEnabled: boolean;
}

export function readDatosRealesConfig(env: NodeJS.ProcessEnv): DatosRealesConfig {
  return {
    anonymizedEnabled: leerBooleano(env, 'REAL_ANONYMIZED_ENABLED', false),
    identifiedEnabled: leerBooleano(env, 'REAL_IDENTIFIED_ENABLED', false),
  };
}

/** Un `REAL_*_ENABLED=true` sin `preflight` superado: el mensaje nombra la variable y ningún otro valor (RN-13). */
export class GateDeDatosRealesNoSuperado extends Error {
  constructor(readonly variable: string) {
    super(`${variable}=true sin el preflight real-data superado`);
    this.name = 'GateDeDatosRealesNoSuperado';
  }
}

/**
 * Guarda de datos reales (RN-13): mientras no exista el `preflight` (US-143, S6), habilitar datos reales anonimizados
 * o identificados impide arrancar, en cualquier entorno. US-143 sustituye esta negativa fija por la comprobación.
 */
export function exigirGateDeDatosReales(datosReales: DatosRealesConfig): void {
  if (datosReales.anonymizedEnabled)
    throw new GateDeDatosRealesNoSuperado('REAL_ANONYMIZED_ENABLED');
  if (datosReales.identifiedEnabled)
    throw new GateDeDatosRealesNoSuperado('REAL_IDENTIFIED_ENABLED');
}

/** Etapa 1: secciones que solo dependen del entorno (sin leer archivos). La usa `arrancar` antes de escuchar. */
export interface ConfiguracionDeArranque {
  puerto: number;
  auth: AuthConfig;
  sesion: SesionConfig;
  logs: LogsConfig;
  datosReales: DatosRealesConfig;
  identidad: IdentityKeyConfig;
}

export function cargarConfiguracion(env: NodeJS.ProcessEnv): ConfiguracionDeArranque {
  return {
    puerto: readPort(env),
    auth: readAuthConfig(env),
    sesion: readSesionConfig(env),
    logs: readLogsConfig(env),
    datosReales: readDatosRealesConfig(env),
    identidad: readIdentityKeyConfig(env),
  };
}

/** Etapa 2: secciones que leen archivos (PostgreSQL, JWT de servicio, gateway de análisis, PII). */
export interface ConfiguracionDeServicios {
  appEnv: string;
  database: DatabaseConfig;
  jwt: ServiceJwtConfig;
  analisis: EvidenceAnalysisConfig;
  deidentificacion: DeidentificationConfig;
}

export function cargarConfiguracionDeServicios(
  env: NodeJS.ProcessEnv,
  readFile: (ruta: string) => string,
): ConfiguracionDeServicios {
  return {
    appEnv: exigirAppEnv(env),
    database: readDatabaseConfig(env, readFile),
    jwt: readServiceJwtConfig(env),
    analisis: readEvidenceAnalysisConfig(env),
    deidentificacion: readDeidentificationConfig(env),
  };
}

const FORMA_DE_NOMBRE_DE_CLAVE = /^[A-Z][A-Z0-9_]*$/;

/**
 * Envuelve el entorno para anotar qué claves de configuración se leyeron y tenían valor: de ahí sale `configKeys` de
 * `/health` (solo nombres, RN-14) sin mantener una segunda lista que se desincronice de las secciones.
 */
export function observarEntorno(env: NodeJS.ProcessEnv): {
  env: NodeJS.ProcessEnv;
  clavesCargadas: () => string[];
} {
  const leidas = new Set<string>();
  const observado = new Proxy(env, {
    get(objetivo, clave) {
      const valor = Reflect.get(objetivo, clave) as unknown;
      if (typeof clave === 'string' && typeof valor === 'string' && valor !== '') leidas.add(clave);
      return valor;
    },
  });
  return {
    env: observado,
    clavesCargadas: () => [...leidas].filter((c) => FORMA_DE_NOMBRE_DE_CLAVE.test(c)).sort(),
  };
}
