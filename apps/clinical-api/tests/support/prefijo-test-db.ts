/**
 * Regla del prefijo de las bases de test (US-035 D2, [S1 resp. 14b]). Es la MISMA que scripts/lib/pg-test-prefix.sh:
 * pg_hba.test.conf admite `/^<prefijo>` como base de datos, así que un prefijo que case con la base clínica,
 * `postgres` o `template*` daría al arnés acceso a una base que no es suya. Una sola constante en el arnés; los
 * datos de la regla viven en el script (BASES_RESERVADAS_TEST_DB) y `tests/unit/arnes-bd.test.ts` comprueba la paridad
 * de veredicto por comportamiento.
 */
export const PATRON_PREFIJO_TEST_DB = /^[a-z][a-z0-9_]{2,}$/;

/**
 * Forma de un nombre de base de test. Es lo que permite interpolar el nombre entre comillas dobles en
 * CREATE/DROP DATABASE (el identificador no admite parámetros): solo minúsculas, dígitos y guion bajo.
 */
export const PATRON_NOMBRE_BASE_TEST = /^[a-z][a-z0-9_]*$/;

const BASES_RESERVADAS = ['postgres', 'template0', 'template1'] as const;

/** Error del arnés: el mensaje nombra la variable, nunca un valor de conexión. */
export class ErrorArnes extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorArnes';
  }
}

function basesQueNoSonDeTest(baseClinica: string): string[] {
  return [baseClinica, ...BASES_RESERVADAS];
}

/** Aborta si el prefijo no cumple la regex o casa con una base que no es de test. Nunca conecta. */
export function validarPrefijoTestDb(prefijo: string, baseClinica: string): void {
  if (!PATRON_PREFIJO_TEST_DB.test(prefijo)) {
    throw new ErrorArnes(
      `PG_TEST_DB_PREFIX no es válido: debe cumplir ${PATRON_PREFIJO_TEST_DB.source}`,
    );
  }
  for (const reservada of basesQueNoSonDeTest(baseClinica)) {
    if (reservada.startsWith(prefijo)) {
      throw new ErrorArnes(
        'PG_TEST_DB_PREFIX casa con una base que no es de test (la clínica, postgres o template*)',
      );
    }
  }
  if (prefijo.startsWith('postgres') || prefijo.startsWith('template')) {
    throw new ErrorArnes(
      'PG_TEST_DB_PREFIX no puede empezar por postgres ni template (bases reservadas)',
    );
  }
}

/**
 * El arnés nunca crea ni borra una base que no sea suya: el nombre generado debe empezar por el prefijo validado y
 * no puede ser ninguna base reservada. Se llama antes de CREATE DATABASE y antes de DROP DATABASE.
 */
export function validarNombreBaseDeTest(
  nombre: string,
  prefijo: string,
  baseClinica: string,
): void {
  validarPrefijoTestDb(prefijo, baseClinica);
  const valido =
    PATRON_NOMBRE_BASE_TEST.test(nombre) &&
    nombre.startsWith(prefijo) &&
    nombre.length > prefijo.length;
  if (!valido || basesQueNoSonDeTest(baseClinica).includes(nombre)) {
    throw new ErrorArnes(
      'la base de test generada no cumple PG_TEST_DB_PREFIX: el arnés no la crea ni la borra',
    );
  }
}
