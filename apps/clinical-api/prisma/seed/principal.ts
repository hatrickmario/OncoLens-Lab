import { randomUUID } from 'node:crypto';
import { ConfiguracionInvalidaError, readAuthConfig } from '../../src/config.js';
import type { PasswordHasher } from '../../src/modules/auth/password-hasher.js';
import { createPasswordHasher } from '../../src/modules/auth/password-hasher.js';
import type { LeerArchivo } from '../../src/config/secrets.js';
import type { Registrar } from '../../src/infrastructure/logger.js';
import { registrarEnConsola } from '../../src/infrastructure/logger.js';
import { leerCatalogo } from './catalogo.js';
import { leerConfiguracionDelSeed } from './config.js';
import { conectarConTlsVerificado } from './conexion.js';
import { relojDelSeed } from './determinismo.js';
import { assertSeedPermitido, SeedBloqueadoError } from './guarda.js';
import { leerArchivoDeTexto } from './archivos.js';
import { leerSecreto } from './secretos.js';
import type { ConexionDelSeed, CredencialesDelSeed, ResumenDelSeed } from './sembrar.js';
import { sembrar } from './sembrar.js';

/** Dependencias de borde del seed: se inyectan para que el test no dependa del proceso ni de la red. */
export interface DependenciasDelSeed {
  /** Abre la conexión a PostgreSQL. Solo se llama después de la guarda y de leer las credenciales. */
  readonly conectar: (env: NodeJS.ProcessEnv) => Promise<ConexionDelSeed>;
  readonly leerArchivo: LeerArchivo;
  readonly hasher: PasswordHasher;
  readonly registrar: Registrar;
  /** Identificador de esta ejecución en los logs (`req_xxxxxxxx`); lo genera el borde del proceso. */
  readonly traceId: string;
}

function leerCredenciales(env: NodeJS.ProcessEnv, leerArchivo: LeerArchivo): CredencialesDelSeed {
  return {
    doctor: leerSecreto(env, 'SEED_DOCTOR_PASSWORD', leerArchivo),
    admin: leerSecreto(env, 'SEED_ADMIN_PASSWORD', leerArchivo),
  };
}

/** Orquesta el seed y registra el resultado con el `traceId` de la ejecución; un fallo solo registra clase y variable. */
export async function ejecutarSeed(
  env: NodeJS.ProcessEnv,
  dependencias: DependenciasDelSeed,
): Promise<ResumenDelSeed> {
  const { registrar, traceId } = dependencias;
  try {
    const filas = await sembrarTrasLaGuarda(env, dependencias);
    registrar({ event: 'seed_completo', traceId, filas });
    return filas;
  } catch (error) {
    registrar(lineaDeFallo(error, traceId));
    throw error;
  }
}

/** Nunca lleva el mensaje del error (puede traer host, usuario o filas): solo la clase y, si existe, la variable. */
function lineaDeFallo(error: unknown, traceId: string): Record<string, unknown> {
  const variable = (error as { variable?: unknown }).variable;
  return {
    event: 'seed_fallido',
    traceId,
    clase: (error as Error).name,
    ...(typeof variable === 'string' ? { variable } : {}),
  };
}

/** Configuración → guarda (RN-13) → credenciales → catálogo → conexión → siembra. */
async function sembrarTrasLaGuarda(
  env: NodeJS.ProcessEnv,
  dependencias: DependenciasDelSeed,
): Promise<ResumenDelSeed> {
  const config = leerConfiguracionDelSeed(env);
  assertSeedPermitido(config);
  const credenciales = leerCredenciales(env, dependencias.leerArchivo);
  const catalogo = leerCatalogo(config.rutaDelCatalogo, dependencias.leerArchivo);
  const conexion = await dependencias.conectar(env);
  try {
    const resumen = await conexion.enTransaccion((sesion) =>
      sembrar(sesion, {
        catalogo,
        reloj: relojDelSeed(config.fechaDeReferencia),
        hasher: dependencias.hasher,
        credenciales,
        retencion: {
          anosHastaRetencion: config.anosHastaRetencion,
          anosHastaRetencionMaxima: config.anosHastaRetencionMaxima,
        },
      }),
    );
    return resumen;
  } finally {
    await conexion.end();
  }
}

const ERRORES_CON_MENSAJE_SEGURO = [SeedBloqueadoError, ConfiguracionInvalidaError];

/** Punto de entrada del proceso (`prisma db seed`): un error conocido se imprime sin valores y sale con código 1. */
export async function ejecutarSeedDelProceso(): Promise<void> {
  try {
    await ejecutarSeed(process.env, {
      conectar: (env) => conectarConTlsVerificado(env, leerArchivoDeTexto, registrarEnConsola),
      leerArchivo: leerArchivoDeTexto,
      hasher: createPasswordHasher(readAuthConfig(process.env).argon2),
      registrar: registrarEnConsola,
      traceId: `req_${randomUUID().slice(0, 8)}`,
    });
  } catch (error) {
    const conocido = ERRORES_CON_MENSAJE_SEGURO.some((clase) => error instanceof clase);
    // Un error inesperado puede traer host, usuario o filas: solo se imprime su clase (RN-10, RN-14).
    console.error(conocido ? (error as Error).message : `El seed falló (${(error as Error).name})`);
    process.exitCode = 1;
  }
}
