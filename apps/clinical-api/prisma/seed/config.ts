import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ConfiguracionInvalidaError } from '../../src/config.js';

/**
 * Configuración del seed (RN-22): nada de lo que varía por entorno es un literal del dominio. Esta parte NO toca
 * secretos: la guarda de entorno (RN-13) decide con ella antes de leer una sola contraseña o abrir la base.
 */

export interface ConfiguracionDelSeed {
  /** `undefined` cuando `APP_ENV` no está definida: la guarda lo rechaza (fallo cerrado). */
  readonly appEnv: string | undefined;
  readonly entornosPermitidos: readonly string[];
  readonly realAnonymizedEnabled: boolean;
  readonly realIdentifiedEnabled: boolean;
  /** Fecha (AAAA-MM-DD) a la que son relativas las fechas clínicas sembradas; el reloj del seed nace de ella. */
  readonly fechaDeReferencia: string;
  readonly rutaDelCatalogo: string;
  /** `retention_until` = inicio + estos años (data-model §4.3). */
  readonly anosHastaRetencion: number;
  /** `retention_max` = inicio + estos años (data-model §4.3). */
  readonly anosHastaRetencionMaxima: number;
}

const ENTORNOS_PERMITIDOS_POR_DEFECTO = 'local,test';
const FECHA_DE_REFERENCIA_POR_DEFECTO = '2026-10-16';
const ANOS_HASTA_RETENCION_POR_DEFECTO = 10;
const ANOS_HASTA_RETENCION_MAXIMA_POR_DEFECTO = 20;
const CATALOGO_DEL_MONOREPO = fileURLToPath(
  new URL('../../../../packages/clinical-catalogs', import.meta.url),
);

function valorOpcional(env: NodeJS.ProcessEnv, variable: string): string | undefined {
  const valor = env[variable];
  return valor === undefined || valor.trim() === '' ? undefined : valor.trim();
}

function analizar<T>(variable: string, esquema: z.ZodType<T>, valor: string, motivo: string): T {
  const resultado = esquema.safeParse(valor);
  // Nunca se cita el valor leído: solo la variable y el motivo (RN-14).
  if (!resultado.success) throw new ConfiguracionInvalidaError(variable, motivo);
  return resultado.data;
}

/** Una bandera ausente o `false` no bloquea; cualquier valor que no sea `true`/`false` es un error (fallo cerrado). */
function leerBandera(env: NodeJS.ProcessEnv, variable: string): boolean {
  const valor = valorOpcional(env, variable);
  if (valor === undefined) return false;
  return analizar(variable, z.enum(['true', 'false']), valor, 'debe ser true o false') === 'true';
}

function leerEnteroPositivo(env: NodeJS.ProcessEnv, variable: string, porDefecto: number): number {
  const valor = valorOpcional(env, variable);
  if (valor === undefined) return porDefecto;
  return analizar(
    variable,
    z.coerce.number().int().positive(),
    valor,
    'debe ser un entero positivo',
  );
}

export function leerConfiguracionDelSeed(env: NodeJS.ProcessEnv): ConfiguracionDelSeed {
  const entornos = valorOpcional(env, 'SEED_ALLOWED_ENVS') ?? ENTORNOS_PERMITIDOS_POR_DEFECTO;
  return {
    appEnv: valorOpcional(env, 'APP_ENV'),
    entornosPermitidos: entornos
      .split(',')
      .map((entorno) => entorno.trim())
      .filter((entorno) => entorno !== ''),
    realAnonymizedEnabled: leerBandera(env, 'REAL_ANONYMIZED_ENABLED'),
    realIdentifiedEnabled: leerBandera(env, 'REAL_IDENTIFIED_ENABLED'),
    fechaDeReferencia: analizar(
      'SEED_REFERENCE_DATE',
      z.iso.date(),
      valorOpcional(env, 'SEED_REFERENCE_DATE') ?? FECHA_DE_REFERENCIA_POR_DEFECTO,
      'debe ser una fecha AAAA-MM-DD',
    ),
    rutaDelCatalogo: valorOpcional(env, 'CLINICAL_CATALOG_PATH') ?? CATALOGO_DEL_MONOREPO,
    anosHastaRetencion: leerEnteroPositivo(
      env,
      'SEED_RETENTION_UNTIL_YEARS',
      ANOS_HASTA_RETENCION_POR_DEFECTO,
    ),
    anosHastaRetencionMaxima: leerEnteroPositivo(
      env,
      'SEED_RETENTION_MAX_YEARS',
      ANOS_HASTA_RETENCION_MAXIMA_POR_DEFECTO,
    ),
  };
}
