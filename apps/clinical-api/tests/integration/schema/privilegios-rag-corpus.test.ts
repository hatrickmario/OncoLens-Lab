import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client } from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { conTransaccionRevertida } from '../../support/db.js';

/**
 * Verifica por catálogo (`has_*_privilege`, sin abrir sesión como el rol: rag_corpus solo entra por corpus-db-net) lo
 * que la migración de privilegios (US-040) deja fijado. El permission denied en ejecución, conectado como rag_corpus,
 * lo prueba Pytest en rag-orchestrator.
 */

const urlBase = inject('urlBaseDeTest');
// Espacio de ids propio de este archivo (los archivos corren en paralelo sobre una sola base): nombra sus tablas.
const ESPACIO_DE_IDS = 41;
const TABLA_FUTURA = `clinical.tabla_futura_${ESPACIO_DE_IDS}_t`;
const MIGRACION = resolve(
  fileURLToPath(
    new URL('../../../prisma/migrations/20261021120000_privilegios_roles', import.meta.url),
  ),
  'migration.sql',
);
const ROLES_DEL_CORPUS = ['rag_corpus', 'rag_corpus_migrator'];
const ESQUEMAS_CLINICOS = ['auth', 'identity', 'clinical', 'audit', 'research'];
const PRIVILEGIOS_DE_TABLA = 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER';

/** Vuelve a ejecutar el SQL de la migración sobre la base de test (dentro de la transacción revertida del test). */
async function aplicarMigracionDePrivilegios(cliente: Client): Promise<void> {
  await cliente.query(readFileSync(MIGRACION, 'utf8'));
}

describe('privilegios de rag_corpus y rag_corpus_migrator', () => {
  it.each(ROLES_DEL_CORPUS)(
    'deja a %s sin ningún privilegio sobre las tablas, las secuencias y los schemas clínicos ni sobre public [US-040 AC-2]',
    async (rol) => {
      await conTransaccionRevertida(urlBase, async (cliente) => {
        const tablas = await cliente.query<{ tabla: string }>(
          `SELECT format('%I.%I', schemaname, tablename) AS tabla FROM pg_tables WHERE schemaname = ANY($1)`,
          [ESQUEMAS_CLINICOS],
        );
        const accesos = await cliente.query<{ objeto: string }>(
          `SELECT t.tabla AS objeto FROM unnest($1::text[]) AS t(tabla)
            WHERE has_any_column_privilege($2, t.tabla, 'SELECT, INSERT, UPDATE, REFERENCES')
               OR has_table_privilege($2, t.tabla, $3)
           UNION ALL
           SELECT s AS objeto FROM unnest($4::text[]) AS s
            WHERE has_schema_privilege($2, s, 'USAGE, CREATE')`,
          [
            tablas.rows.map((fila) => fila.tabla),
            rol,
            PRIVILEGIOS_DE_TABLA,
            [...ESQUEMAS_CLINICOS, 'public'],
          ],
        );

        expect(tablas.rowCount).toBeGreaterThan(20);
        expect(accesos.rows).toEqual([]);
      });
    },
  );

  it.each(ROLES_DEL_CORPUS)(
    'nace sin acceso para %s una tabla creada después por el rol de migraciones, aunque un default previo se lo concediera [US-040 AC-3]',
    async (rol) => {
      await conTransaccionRevertida(urlBase, async (cliente) => {
        // Precondición hostil: un privilegio por defecto previo que le daría acceso a las tablas futuras.
        await cliente.query(
          `ALTER DEFAULT PRIVILEGES IN SCHEMA clinical GRANT SELECT ON TABLES TO ${rol}`,
        );
        await aplicarMigracionDePrivilegios(cliente);

        await cliente.query(`CREATE TABLE ${TABLA_FUTURA} (id int)`);
        const acceso = await cliente.query<{ puede: boolean }>(
          `SELECT has_table_privilege($1, '${TABLA_FUTURA}', $2) AS puede`,
          [rol, PRIVILEGIOS_DE_TABLA],
        );

        expect(acceso.rows[0]?.puede).toBe(false);
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
  it('no hereda nada en public ni en los schemas clínicos [US-040 AC-3]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      await cliente.query(`CREATE TABLE ${TABLA_FUTURA} (id int)`);
      const acceso = await cliente.query<{ puede: boolean }>(
        `SELECT bool_or(has_schema_privilege('rag_corpus', s, 'USAGE, CREATE')) AS puede
           FROM unnest(ARRAY['public', 'auth', 'identity', 'clinical', 'audit', 'research']) AS s`,
      );
      const tabla = await cliente.query<{ acl: string | null }>(
        `SELECT relacl::text AS acl FROM pg_class WHERE oid = '${TABLA_FUTURA}'::regclass`,
      );

      expect(acceso.rows[0]?.puede).toBe(false);
      expect(tabla.rows[0]?.acl ?? '').not.toContain('=r');
    });
  });
});

describe('límites de sesión de rag_corpus', () => {
  it('fija statement_timeout e idle_in_transaction_session_timeout positivos en el rol, con valores de configuración [US-040 AC-2]', async () => {
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
