import { z } from 'zod';

const DEFAULT_PORT = 3000;

const FORMA_DE_ENTERO = /^\d+$/;
const esquemaDePuerto = z.number().int().min(1).max(65535);
const esquemaDeEnteroPositivo = z.number().int().positive();
const esquemaDeBooleano = z.enum(['true', 'false']);

/**
 * Valor numérico de una variable opcional validado con su esquema Zod. Única regla de lectura numérica: ausente o
 * vacía devuelve el valor por defecto; inválida lanza un error que nombra la variable y la regla, nunca el valor.
 */
function leerNumero(
  env: NodeJS.ProcessEnv,
  variable: string,
  esquema: z.ZodType<number>,
  regla: string,
  valorPorDefecto: number,
): number {
  const crudo = env[variable];
  if (crudo === undefined || crudo === '') return valorPorDefecto;
  // Solo cadenas de dígitos: `Number()` aceptaría `0x50`, `1e3` o espacios.
  const resultado = esquema.safeParse(FORMA_DE_ENTERO.test(crudo) ? Number(crudo) : Number.NaN);
  if (!resultado.success) throw new ConfiguracionInvalidaError(variable, regla);
  return resultado.data;
}

/** Puerto de escucha desde `PORT` (RN-22: configuración, no literal en el código de arranque). */
export function readPort(env: NodeJS.ProcessEnv): number {
  return leerNumero(env, 'PORT', esquemaDePuerto, 'debe ser un puerto TCP válido', DEFAULT_PORT);
}

export interface Argon2Config {
  memoryCostKib: number;
  timeCost: number;
  parallelism: number;
}

/** Configuración de sesión y de hash de contraseñas (RN-22: calibrable, no literal del dominio). */
export interface AuthConfig {
  sessionTtlHours: number;
  argon2: Argon2Config;
}

const DEFAULT_SESSION_TTL_HOURS = 8;
// Mínimo recomendado por OWASP para Argon2id; calibrable por entorno (la CI puede bajarlos).
const DEFAULT_ARGON2_MEMORY_COST_KIB = 19456;
const DEFAULT_ARGON2_TIME_COST = 2;
const DEFAULT_ARGON2_PARALLELISM = 1;

export function readPositiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
): number {
  return leerNumero(
    env,
    name,
    esquemaDeEnteroPositivo,
    'debe ser un entero positivo',
    defaultValue,
  );
}

/** TTL absoluto de la sesión y parámetros de Argon2id (RN-22: configuración, nunca literales del dominio). */
export function readAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  return {
    sessionTtlHours: readPositiveInteger(env, 'SESSION_TTL_HOURS', DEFAULT_SESSION_TTL_HOURS),
    argon2: {
      memoryCostKib: readPositiveInteger(
        env,
        'ARGON2_MEMORY_COST_KIB',
        DEFAULT_ARGON2_MEMORY_COST_KIB,
      ),
      timeCost: readPositiveInteger(env, 'ARGON2_TIME_COST', DEFAULT_ARGON2_TIME_COST),
      parallelism: readPositiveInteger(env, 'ARGON2_PARALLELISM', DEFAULT_ARGON2_PARALLELISM),
    },
  };
}

const DEFAULT_SERVICE_JWT_TTL_SECONDS = 60;

export interface ServiceJwtConfig {
  ttlSeconds: number;
  privateKeyFile: string;
}

/**
 * Configuración del JWT de servicio hacia rag-orchestrator (RN-22: la vida no es un literal del código).
 * Sin `SERVICE_JWT_PRIVATE_KEY_FILE` el arranque falla (fallo cerrado).
 */
export function readServiceJwtConfig(env: NodeJS.ProcessEnv): ServiceJwtConfig {
  const privateKeyFile = env['SERVICE_JWT_PRIVATE_KEY_FILE'];
  if (privateKeyFile === undefined || privateKeyFile === '') {
    throw new ConfiguracionInvalidaError('SERVICE_JWT_PRIVATE_KEY_FILE', 'no está configurada', {
      motivo: 'variable_ausente',
    });
  }
  const ttlSeconds = readPositiveInteger(
    env,
    'SERVICE_JWT_TTL_SECONDS',
    DEFAULT_SERVICE_JWT_TTL_SECONDS,
  );
  return { ttlSeconds, privateKeyFile };
}

/** Motivos cerrados del evento `configuracion_invalida`; otros changes añaden los suyos (tipos). */
export type MotivoDeConfiguracionInvalida =
  'valor_invalido' | 'variable_ausente' | 'catalogo_no_disponible' | 'version_catalogo_distinta';

/**
 * Un elemento inválido de un enum no sensible se registra solo si son letras minúsculas (hasta 24): descarta números,
 * identificadores hexadecimales, correos y claves con guiones o dígitos (design D2).
 */
const FORMA_DE_VALOR_REGISTRABLE = /^[a-z]{1,24}$/;

/**
 * Falta o es inválida una variable de configuración: el mensaje nombra la clave y la regla, nunca su valor (RN-10,
 * RN-14). El constructor público no admite el valor; solo `deEnumNoSensible` fija `valorInvalido`.
 */
export class ConfiguracionInvalidaError extends Error {
  readonly motivo: MotivoDeConfiguracionInvalida;
  #valorInvalido: string | undefined;

  constructor(
    readonly variable: string,
    readonly regla: string,
    opciones: { motivo?: MotivoDeConfiguracionInvalida } = {},
  ) {
    super(`${variable} ${regla}`);
    this.name = 'ConfiguracionInvalidaError';
    this.motivo = opciones.motivo ?? 'valor_invalido';
  }

  /** Elemento inválido de un enum no sensible, solo si cumple la forma cerrada; `undefined` en cualquier otro caso. */
  get valorInvalido(): string | undefined {
    return this.#valorInvalido;
  }

  /** Única vía para registrar el valor: una clave declarada como enum no sensible (`leerEnumNoSensible`). */
  static deEnumNoSensible(
    variable: string,
    regla: string,
    valor: string,
  ): ConfiguracionInvalidaError {
    const error = new ConfiguracionInvalidaError(variable, regla);
    if (FORMA_DE_VALOR_REGISTRABLE.test(valor)) error.#valorInvalido = valor;
    return error;
  }
}

/**
 * Variable cuyo valor es un elemento de un enum NO sensible (p. ej. un tipo de cáncer): si es inválida, el error lleva
 * el elemento en `valorInvalido` solo cuando cumple `^[a-z]{1,24}$` (design D2). Ninguna otra clave puede usarlo.
 */
export function leerEnumNoSensible<T extends string>(
  env: NodeJS.ProcessEnv,
  variable: string,
  permitidos: readonly [T, ...T[]],
  valorPorDefecto: T,
): T {
  const crudo = env[variable];
  if (crudo === undefined || crudo === '') return valorPorDefecto;
  const resultado = z.enum(permitidos).safeParse(crudo);
  if (!resultado.success) {
    throw ConfiguracionInvalidaError.deEnumNoSensible(
      variable,
      `debe ser uno de: ${permitidos.join(', ')}`,
      crudo,
    );
  }
  return resultado.data;
}

/** Booleano estricto (`true` | `false`); ausente o vacío devuelve el valor por defecto. */
export function leerBooleano(
  env: NodeJS.ProcessEnv,
  variable: string,
  valorPorDefecto: boolean,
): boolean {
  const crudo = env[variable]?.trim().toLowerCase();
  if (crudo === undefined || crudo === '') return valorPorDefecto;
  const resultado = esquemaDeBooleano.safeParse(crudo);
  if (!resultado.success) throw new ConfiguracionInvalidaError(variable, 'debe ser true o false');
  return resultado.data === 'true';
}

function leerObligatoria(env: NodeJS.ProcessEnv, variable: string): string {
  const valor = env[variable];
  if (valor === undefined || valor.trim() === '') {
    throw new ConfiguracionInvalidaError(variable, 'es obligatoria', {
      motivo: 'variable_ausente',
    });
  }
  return valor;
}

/** Entorno de ejecución (`local`, `test`, `piloto`...): obligatorio, sin valor por defecto (fallo cerrado). */
export function exigirAppEnv(env: NodeJS.ProcessEnv): string {
  return leerObligatoria(env, 'APP_ENV');
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  /** Certificado de la CA que firma el del servidor PostgreSQL (verificación TLS completa). */
  ca: string;
}

const PUERTO_POSTGRES_POR_DEFECTO = 5432;

/**
 * Contenido (sin espacios de borde) del archivo de un secreto `*_FILE`. Única regla de lectura de secretos por archivo:
 * el error nombra la variable y nunca la ruta ni el contenido (RN-10, RN-14).
 */
export function leerSecretoDeArchivo(
  variable: string,
  ruta: string,
  readFile: (ruta: string) => string,
): string {
  let contenido: string;
  try {
    contenido = readFile(ruta).trim();
  } catch {
    // El error de E/S trae la ruta: se descarta y solo se nombra la variable.
    throw new ConfiguracionInvalidaError(variable, 'no apunta a un archivo legible');
  }
  if (contenido === '') throw new ConfiguracionInvalidaError(variable, 'apunta a un archivo vacío');
  return contenido;
}

function leerArchivoObligatorio(
  env: NodeJS.ProcessEnv,
  variable: string,
  readFile: (ruta: string) => string,
): string {
  return leerSecretoDeArchivo(variable, leerObligatoria(env, variable), readFile);
}

function leerUrlDeBaseDeDatos(env: NodeJS.ProcessEnv): URL {
  const variable = 'CLINICAL_DATABASE_URL';
  let url: URL;
  try {
    url = new URL(leerObligatoria(env, variable));
  } catch (error) {
    if (error instanceof ConfiguracionInvalidaError) throw error;
    throw new ConfiguracionInvalidaError(variable, 'no es una URL válida');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new ConfiguracionInvalidaError(variable, 'debe usar el esquema postgresql');
  }
  if (url.password !== '') {
    throw new ConfiguracionInvalidaError(
      variable,
      'no debe llevar contraseña (va en PG_CLINICAL_API_PASSWORD_FILE)',
    );
  }
  if (url.hostname === '' || url.username === '' || url.pathname.length <= 1) {
    throw new ConfiguracionInvalidaError(variable, 'debe indicar usuario, host y base de datos');
  }
  return url;
}

/**
 * Conexión del rol `clinical_api` a PostgreSQL. La URL NO lleva contraseña (RN-14): esta se lee del archivo del
 * secreto (`PG_CLINICAL_API_PASSWORD_FILE`) y la CA de `CLINICAL_DATABASE_CA_FILE`.
 */
export function readDatabaseConfig(
  env: NodeJS.ProcessEnv,
  readFile: (ruta: string) => string,
): DatabaseConfig {
  const url = leerUrlDeBaseDeDatos(env);
  return {
    host: url.hostname,
    port: url.port === '' ? PUERTO_POSTGRES_POR_DEFECTO : Number(url.port),
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: leerArchivoObligatorio(env, 'PG_CLINICAL_API_PASSWORD_FILE', readFile),
    ca: leerArchivoObligatorio(env, 'CLINICAL_DATABASE_CA_FILE', readFile),
  };
}

/** Archivos de clave de la identidad cifrada (US-046, D3). Los archivos se leen en `cargarClavesDeIdentidad`. */
export interface IdentityKeyConfig {
  /** `IDENTITY_KEY_VERSION`: versión con la que se cifra (por defecto 1). */
  keyVersion: number;
  /** `IDENTITY_AES_KEY_FILE`: la clave de la versión activa. */
  activeKeyFile: string;
  /** `IDENTITY_AES_KEY_V<n>_FILE`: claves de versiones anteriores, solo para descifrar. */
  previousKeyFiles: ReadonlyMap<number, string>;
  /** `BLIND_INDEX_HMAC_KEY_FILE`: clave HMAC del índice ciego (no rota en el MVP). */
  hmacKeyFile: string;
}

const DEFAULT_IDENTITY_KEY_VERSION = 1;
const PATRON_DE_CLAVE_ANTERIOR = /^IDENTITY_AES_KEY_V(\d+)_FILE$/;

/** Lee los nombres de archivo de las claves de identidad; el error nombra la variable, nunca un valor (RN-10, RN-14). */
export function readIdentityKeyConfig(env: NodeJS.ProcessEnv): IdentityKeyConfig {
  const keyVersion = readPositiveInteger(env, 'IDENTITY_KEY_VERSION', DEFAULT_IDENTITY_KEY_VERSION);
  const previousKeyFiles = new Map<number, string>();
  // Se recorren solo los NOMBRES: el valor se lee únicamente de las variables que coinciden con el patrón.
  for (const variable of Object.keys(env)) {
    const version = PATRON_DE_CLAVE_ANTERIOR.exec(variable)?.[1];
    if (version === undefined) continue;
    const ruta = env[variable];
    if (ruta === undefined || ruta === '') continue;
    if (Number(version) === keyVersion) {
      throw new ConfiguracionInvalidaError(
        variable,
        'no puede definirse para la versión activa (va en IDENTITY_AES_KEY_FILE)',
      );
    }
    previousKeyFiles.set(Number(version), ruta);
  }
  return {
    keyVersion,
    activeKeyFile: leerObligatoria(env, 'IDENTITY_AES_KEY_FILE'),
    previousKeyFiles,
    hmacKeyFile: leerObligatoria(env, 'BLIND_INDEX_HMAC_KEY_FILE'),
  };
}

/** Rutas y umbral de la desidentificación (L1D-203, RN-11, RN-22); el contenido de los archivos lo valida `cargarConfiguracionDePii`. */
export interface DeidentificationConfig {
  /** `PII_FORMATS_PATH`: `config/pii-formats.json` de L1D-166 (fuente única de formatos), montado de solo lectura. */
  formatsPath: string;
  /** `PII_MASKS_PATH`: reglas de reemplazo (`apps/clinical-api/config/pii-masks.json`). */
  masksPath: string;
  /** `PII_NAME_TOKEN_MIN_LENGTH`: longitud mínima de un token de nombre para enmascararlo. */
  nameTokenMinLength: number;
}

const DEFAULT_PII_NAME_TOKEN_MIN_LENGTH = 3;

export function readDeidentificationConfig(env: NodeJS.ProcessEnv): DeidentificationConfig {
  return {
    formatsPath: leerObligatoria(env, 'PII_FORMATS_PATH'),
    masksPath: leerObligatoria(env, 'PII_MASKS_PATH'),
    nameTokenMinLength: readPositiveInteger(
      env,
      'PII_NAME_TOKEN_MIN_LENGTH',
      DEFAULT_PII_NAME_TOKEN_MIN_LENGTH,
    ),
  };
}

export interface EvidenceAnalysisConfig {
  /** Hostname interno de rag-orchestrator en Compose (nunca publicado al host). */
  ragOrchestratorUrl: string;
  /** Directorio de solo lectura del catálogo clínico; de él sale `catalogVersion` (`manifest.json`). */
  catalogPath: string;
  /** `CLINICAL_CATALOG_VERSION`: expectativa opcional; si difiere del `manifest.json` montado el servicio no arranca. */
  catalogExpectedVersion?: string;
  /** `maxOptions` del request interno: 1 en el S1, 3 desde el S4 (RN-22). */
  analysisMaxOptions: number;
  /** Años de antigüedad por defecto de la evidencia cuando la petición no trae `publishedFromYear` (RN-22). */
  evidenceDefaultYears: number;
  /** Plazo de la llamada a rag-orchestrator en milisegundos (`RAG_TIMEOUT_MS`, RN-22): `X-Request-Deadline` y abortar. */
  ragTimeoutMs: number;
  /** `AI_DISCLAIMER_TEXT`: aviso de IA de la respuesta (literal de US-069 y PRD E-11, sin la etiqueta de uso académico); obligatorio y no vacío, nunca un literal del código. */
  aiDisclaimerText: string;
}

const DEFAULT_ANALYSIS_MAX_OPTIONS = 1;
/** `maximum` de `maxOptions` en `RagQueryInternalRequest` (contrato de rag-orchestrator). */
const CONTRACT_MAX_OPTIONS = 3;
const DEFAULT_EVIDENCE_YEARS = 10;
const DEFAULT_RAG_TIMEOUT_MS = 30_000;

function leerUrlHttpObligatoria(env: NodeJS.ProcessEnv, variable: string): string {
  const valor = leerObligatoria(env, variable);
  try {
    const url = new URL(valor);
    if (url.protocol === 'http:' || url.protocol === 'https:') return valor;
  } catch {
    // Se descarta el error del parser: puede citar el valor.
  }
  throw new ConfiguracionInvalidaError(variable, 'debe ser una URL http(s) válida');
}

/**
 * Configuración del gateway de análisis (RN-22: nada de esto es un literal del dominio). Los valores inválidos nombran
 * la variable y nunca su valor.
 */
export function readEvidenceAnalysisConfig(env: NodeJS.ProcessEnv): EvidenceAnalysisConfig {
  const analysisMaxOptions = readPositiveInteger(
    env,
    'ANALYSIS_MAX_OPTIONS',
    DEFAULT_ANALYSIS_MAX_OPTIONS,
  );
  if (analysisMaxOptions > CONTRACT_MAX_OPTIONS) {
    throw new ConfiguracionInvalidaError(
      'ANALYSIS_MAX_OPTIONS',
      `no puede superar ${CONTRACT_MAX_OPTIONS} (máximo del contrato)`,
    );
  }
  return {
    ragOrchestratorUrl: leerUrlHttpObligatoria(env, 'RAG_ORCHESTRATOR_URL'),
    catalogPath: leerObligatoria(env, 'CLINICAL_CATALOG_PATH'),
    ...(env['CLINICAL_CATALOG_VERSION']?.trim() && {
      catalogExpectedVersion: env['CLINICAL_CATALOG_VERSION'].trim(),
    }),
    analysisMaxOptions,
    evidenceDefaultYears: readPositiveInteger(
      env,
      'EVIDENCE_DEFAULT_YEARS',
      DEFAULT_EVIDENCE_YEARS,
    ),
    ragTimeoutMs: readPositiveInteger(env, 'RAG_TIMEOUT_MS', DEFAULT_RAG_TIMEOUT_MS),
    aiDisclaimerText: leerObligatoria(env, 'AI_DISCLAIMER_TEXT'),
  };
}
