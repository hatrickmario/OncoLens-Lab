import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client } from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { SCHEMAS_CLINICOS } from '../../support/catalogo.js';
import { conTransaccionRevertida } from '../../support/db.js';

/**
 * Verifica por catálogo (`has_*_privilege`, sin abrir sesión como el rol: rag_corpus solo entra por corpus-db-net) lo
 * que la migración de privilegios (US-040) deja fijado. El permission denied en ejecución, conectado como rag_corpus,
 * lo prueba Pytest en rag-orchestrator.
 */

const urlBase = inject('urlBaseDeTest');
// Espacio de ids propio de este archivo (los archivos corren en paralelo sobre una sola base): nombra sus objetos.
const ESPACIO_DE_IDS = 41;
const TABLA_FUTURA = `clinical.tabla_futura_${ESPACIO_DE_IDS}_t`;
const SECUENCIA_FUTURA = `clinical.secuencia_futura_${ESPACIO_DE_IDS}_s`;
const FUNCION_PREVIA = `clinical.funcion_previa_${ESPACIO_DE_IDS}()`;
const FUNCION_FUTURA = `clinical.funcion_futura_${ESPACIO_DE_IDS}()`;
const MIGRACION = resolve(
  fileURLToPath(
    new URL('../../../prisma/migrations/20261021120000_privilegios_roles', import.meta.url),
  ),
  'migration.sql',
);
const ROLES_DEL_CORPUS = ['rag_corpus', 'rag_corpus_migrator'];
const PRIVILEGIOS_DE_TABLA = 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER';
/** Dónde puede estar un privilegio por defecto previo: el global no lo quita un `IN SCHEMA` (hallazgo de privacy). */
const ALCANCES_DEL_DEFAULT_PREVIO = [
  ['de un schema', 'IN SCHEMA clinical'],
  ['global', ''],
] as const;

/** Vuelve a ejecutar el SQL de la migración sobre la base de test (dentro de la transacción revertida del test). */
async function aplicarMigracionDePrivilegios(cliente: Client): Promise<void> {
  await cliente.query(readFileSync(MIGRACION, 'utf8'));
}

async function crearFuncion(cliente: Client, firma: string): Promise<void> {
  await cliente.query(`CREATE FUNCTION ${firma} RETURNS int LANGUAGE sql AS 'SELECT 1'`);
}

async function consultar(cliente: Client, sql: string, parametros: unknown[]): Promise<boolean> {
  const resultado = await cliente.query<{ puede: boolean }>(sql, parametros);
  return resultado.rows[0]?.puede ?? true;
}

describe('privilegios de rag_corpus y rag_corpus_migrator', () => {
  it.each(ROLES_DEL_CORPUS)(
    'deja a %s sin ningún privilegio sobre las tablas, las secuencias y los schemas clínicos ni sobre public [US-040 AC-2]',
    async (rol) => {
      await conTransaccionRevertida(urlBase, async (cliente) => {
        const tablas = await cliente.query<{ tabla: string }>(
          `SELECT format('%I.%I', schemaname, tablename) AS tabla FROM pg_tables WHERE schemaname = ANY($1)`,
          [SCHEMAS_CLINICOS],
        );
        const secuencias = await cliente.query<{ secuencia: string }>(
          `SELECT format('%I.%I', schemaname, sequencename) AS secuencia FROM pg_sequences WHERE schemaname = ANY($1)`,
          [SCHEMAS_CLINICOS],
        );
        const accesos = await cliente.query<{ objeto: string }>(
          `SELECT t.tabla AS objeto FROM unnest($1::text[]) AS t(tabla)
            WHERE has_any_column_privilege($2, t.tabla, 'SELECT, INSERT, UPDATE, REFERENCES')
               OR has_table_privilege($2, t.tabla, $3)
           UNION ALL
           SELECT q.secuencia AS objeto FROM unnest($5::text[]) AS q(secuencia)
            WHERE has_sequence_privilege($2, q.secuencia, 'USAGE, SELECT, UPDATE')
           UNION ALL
           SELECT s AS objeto FROM unnest($4::text[]) AS s
            WHERE has_schema_privilege($2, s, 'USAGE, CREATE')`,
          [
            tablas.rows.map((fila) => fila.tabla),
            rol,
            PRIVILEGIOS_DE_TABLA,
            [...SCHEMAS_CLINICOS, 'public'],
            secuencias.rows.map((fila) => fila.secuencia),
          ],
        );

        expect(tablas.rowCount).toBeGreaterThan(20);
        expect(accesos.rows).toEqual([]);
      });
    },
  );

  it.each(ROLES_DEL_CORPUS)(
    'no tiene ningún schema con USAGE o CREATE para %s, sea cual sea, salvo corpus [US-040 AC-2]',
    async (rol) => {
      await conTransaccionRevertida(urlBase, async (cliente) => {
        const schemas = await cliente.query<{ schema: string }>(
          `SELECT nspname AS schema FROM pg_namespace
            WHERE nspname <> 'corpus' AND nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'
              AND has_schema_privilege($1, oid, 'USAGE, CREATE')`,
          [rol],
        );
        const todos = await cliente.query<{ total: string }>(
          `SELECT count(*) AS total FROM pg_namespace WHERE nspname = ANY($1)`,
          [[...SCHEMAS_CLINICOS, 'public']],
        );

        expect(Number(todos.rows[0]?.total)).toBe(SCHEMAS_CLINICOS.length + 1);
        expect(schemas.rows).toEqual([]);
      });
    },
  );

  it('no es miembro de ningún rol ni tiene miembros, así que nada se hereda [US-040 AC-2]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const membresias = await cliente.query<{ rol: string }>(
        `SELECT r.rolname AS rol FROM pg_auth_members m
           JOIN pg_roles r ON r.oid IN (m.roleid, m.member)
          WHERE r.rolname = ANY($1)`,
        [ROLES_DEL_CORPUS],
      );

      expect(membresias.rows).toEqual([]);
    });
  });

  it.each(ROLES_DEL_CORPUS.flatMap((rol) => ALCANCES_DEL_DEFAULT_PREVIO.map((a) => [rol, ...a])))(
    'nace sin acceso para %s una tabla, una secuencia y una función creadas después, aunque un default %s previo se lo concediera [US-040 AC-3]',
    async (rol, _alcance, ambito) => {
      await conTransaccionRevertida(urlBase, async (cliente) => {
        // Precondición hostil: privilegios por defecto previos que le darían acceso a lo que se cree después.
        await cliente.query(`ALTER DEFAULT PRIVILEGES ${ambito} GRANT SELECT ON TABLES TO ${rol}`);
        await cliente.query(
          `ALTER DEFAULT PRIVILEGES ${ambito} GRANT USAGE ON SEQUENCES TO ${rol}`,
        );
        await cliente.query(
          `ALTER DEFAULT PRIVILEGES ${ambito} GRANT EXECUTE ON FUNCTIONS TO ${rol}`,
        );
        await aplicarMigracionDePrivilegios(cliente);

        await cliente.query(`CREATE TABLE ${TABLA_FUTURA} (id int)`);
        await cliente.query(`CREATE SEQUENCE ${SECUENCIA_FUTURA}`);
        await crearFuncion(cliente, FUNCION_FUTURA);

        expect(
          await consultar(
            cliente,
            `SELECT has_table_privilege($1, '${TABLA_FUTURA}', $2) AS puede`,
            [rol, PRIVILEGIOS_DE_TABLA],
          ),
        ).toBe(false);
        expect(
          await consultar(
            cliente,
            `SELECT has_sequence_privilege($1, '${SECUENCIA_FUTURA}', 'USAGE, SELECT, UPDATE') AS puede`,
            [rol],
          ),
        ).toBe(false);
        expect(
          await consultar(
            cliente,
            `SELECT has_function_privilege($1, '${FUNCION_FUTURA}', 'EXECUTE') AS puede`,
            [rol],
          ),
        ).toBe(false);
      });
    },
  );

  it('es idempotente y revoca lo concedido a mano cuando se aplica de nuevo [US-040 AC-2]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      await cliente.query('GRANT USAGE ON SCHEMA clinical TO rag_corpus');
      await cliente.query('GRANT SELECT ON clinical.patient TO rag_corpus');

      await aplicarMigracionDePrivilegios(cliente);
      await aplicarMigracionDePrivilegios(cliente);

      const acceso = await cliente.query<{ puede: boolean }>(
        `SELECT has_table_privilege('rag_corpus', 'clinical.patient', 'SELECT')
             OR has_schema_privilege('rag_corpus', 'clinical', 'USAGE') AS puede`,
      );
      expect(acceso.rows[0]?.puede).toBe(false);
    });
  });
});

describe('privilegios de PUBLIC', () => {
  it('no deja a rag_corpus ni USAGE ni CREATE en public ni en los schemas clínicos [US-040 AC-3]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const puede = await consultar(
        cliente,
        `SELECT bool_or(has_schema_privilege('rag_corpus', s, 'USAGE, CREATE')) AS puede
           FROM unnest($1::text[]) AS s`,
        [[...SCHEMAS_CLINICOS, 'public']],
      );

      expect(puede).toBe(false);
    });
  });

  it('quita lo concedido a PUBLIC en tablas y funciones previas y no concede nada a las futuras [US-040 AC-3]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      // Precondición hostil: PUBLIC ya tiene acceso a una tabla y una función existentes.
      await cliente.query('GRANT SELECT ON clinical.patient TO PUBLIC');
      await crearFuncion(cliente, FUNCION_PREVIA);
      await aplicarMigracionDePrivilegios(cliente);
      await cliente.query(`CREATE TABLE ${TABLA_FUTURA} (id int)`);
      await crearFuncion(cliente, FUNCION_FUTURA);

      const entradasDePublic = await cliente.query<{ objeto: string }>(
        `SELECT c.oid::regclass::text AS objeto FROM pg_class c, aclexplode(c.relacl) a
          WHERE c.oid IN ('clinical.patient'::regclass, '${TABLA_FUTURA}'::regclass) AND a.grantee = 0`,
      );
      const funcionesEjecutables = await cliente.query<{ funcion: string }>(
        `SELECT p.oid::regprocedure::text AS funcion FROM pg_proc p
          WHERE p.oid IN ('${FUNCION_PREVIA}'::regprocedure, '${FUNCION_FUTURA}'::regprocedure)
            AND has_function_privilege('rag_corpus', p.oid, 'EXECUTE')`,
      );

      expect(entradasDePublic.rows).toEqual([]);
      expect(funcionesEjecutables.rows).toEqual([]);
    });
  });

  it.each(['rag_corpus', 'rag_corpus_migrator', 'research_writer'])(
    'quita TEMPORARY sobre la base a %s porque PUBLIC no la hereda [US-040 AC-3]',
    async (rol) => {
      await conTransaccionRevertida(urlBase, async (cliente) => {
        const puede = await consultar(
          cliente,
          `SELECT has_database_privilege($1, current_database(), 'TEMPORARY') AS puede`,
          [rol],
        );

        expect(puede).toBe(false);
      });
    },
  );
});

describe('límites de sesión de rag_corpus', () => {
  it('fija statement_timeout e idle_in_transaction_session_timeout positivos en el rol [US-040 AC-2]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const rol = await cliente.query<{ rolconfig: string[] | null }>(
        `SELECT rolconfig FROM pg_roles WHERE rolname = 'rag_corpus'`,
      );
      const ajustes = Object.fromEntries(
        (rol.rows[0]?.rolconfig ?? []).map((par) => par.split('=') as [string, string]),
      );

      expect(Number(ajustes.statement_timeout)).toBeGreaterThan(0);
      expect(Number(ajustes.idle_in_transaction_session_timeout)).toBeGreaterThan(0);
    });
  });
});
