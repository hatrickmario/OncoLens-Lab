import { describe, expect, inject, it } from 'vitest';
import { conectar, conTransaccionRevertida, esperarRechazo } from '../../support/db.js';
import {
  filaDeDiagnostico,
  generadorDeIds,
  insertar,
  insertarContextoClinico,
} from '../../support/filas-sinteticas.js';

const urlBase = inject('urlBaseDeTest');
// Espacio de ids propio de este archivo (los archivos corren en paralelo sobre una sola base).
const ESPACIO_DE_IDS = 3;

describe('Integridad referencial del schema clinical', () => {
  it('falla por la FK y conserva paciente y diagnóstico cuando se borra un paciente con diagnóstico [US-038 AC-5]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const contexto = await insertarContextoClinico(cliente, ids);
      await insertar(
        cliente,
        'clinical.diagnosis',
        filaDeDiagnostico(ids, contexto.patientId, contexto.episodeId),
      );

      const error = await esperarRechazo(cliente, 'DELETE FROM clinical.patient WHERE id = $1', [
        contexto.patientId,
      ]);
      const pacientes = await cliente.query(
        'SELECT count(*)::int AS n FROM clinical.patient WHERE id = $1',
        [contexto.patientId],
      );
      const diagnosticos = await cliente.query(
        'SELECT count(*)::int AS n FROM clinical.diagnosis WHERE patient_id = $1',
        [contexto.patientId],
      );

      expect(error.code).toBe('23503');
      expect(pacientes.rows[0]).toEqual({ n: 1 });
      expect(diagnosticos.rows[0]).toEqual({ n: 1 });
    });
  });

  it('declara ON DELETE RESTRICT en todas las FK de las tablas clinical cuando se consulta pg_constraint [US-038 AC-5]', async () => {
    const cliente = await conectar(urlBase);
    try {
      const { rows } = await cliente.query<{ tabla: string; accion: string }>(
        `SELECT c.conrelid::regclass::text AS tabla, c.confdeltype AS accion
           FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
          WHERE c.contype = 'f' AND n.nspname = 'clinical'`,
      );

      expect(rows.length).toBeGreaterThan(40);
      expect(rows.filter((fila) => fila.accion !== 'r')).toEqual([]);
    } finally {
      await cliente.end();
    }
  });
});
