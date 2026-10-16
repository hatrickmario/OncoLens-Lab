import { describe, expect, inject, it } from 'vitest';
import { columnasDe } from '../../support/catalogo.js';
import { conectar, conTransaccionRevertida, esperarRechazo } from '../../support/db.js';
import { filaDeIdentidad, filaDePaciente, generadorDeIds, insertar, sqlInsertar } from '../../support/filas-sinteticas.js';

const urlBase = inject('urlBaseDeTest');

describe('identity.patient_identity', () => {
  it.each([
    ['con país emisor', 'CO'],
    ['con país emisor nulo', null],
  ])('rechaza por el índice ciego único la segunda identidad con el mismo id_type, país y HMAC %s [US-038 AC-6]', async (_caso, pais) => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds();
      const primero = await insertar(cliente, 'clinical.patient', filaDePaciente(ids));
      const segundo = await insertar(cliente, 'clinical.patient', filaDePaciente(ids));
      await insertar(cliente, 'identity.patient_identity', filaDeIdentidad(primero.id as string, { issuing_country: pais }));
      const { sql, valores } = sqlInsertar('identity.patient_identity', filaDeIdentidad(segundo.id as string, { issuing_country: pais }));

      const error = await esperarRechazo(cliente, sql, valores);

      expect(error.code).toBe('23505');
      expect(error.constraint).toBe('patient_identity_blind_index_uq');
    });
  });

  it('admite la misma identidad en otro país porque la unicidad incluye issuing_country [US-038 AC-6]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds();
      const primero = await insertar(cliente, 'clinical.patient', filaDePaciente(ids));
      const segundo = await insertar(cliente, 'clinical.patient', filaDePaciente(ids));
      await insertar(cliente, 'identity.patient_identity', filaDeIdentidad(primero.id as string, { issuing_country: 'CO' }));

      const otra = await insertar(cliente, 'identity.patient_identity', filaDeIdentidad(segundo.id as string, { issuing_country: 'PE' }));

      expect(otra.issuing_country).toBe('PE');
    });
  });

  it('guarda documento y nombre solo como bytea *_ciphertext cuando se listan las columnas del schema identity [US-038 AC-6]', async () => {
    const cliente = await conectar(urlBase);
    try {
      for (const tabla of ['patient_identity', 'legal_representative']) {
        const columnas = await columnasDe(cliente, 'identity', tabla);
        const sensibles = columnas.filter((c) => /national_id|full_name/.test(c.nombre));

        expect(sensibles.length, tabla).toBeGreaterThanOrEqual(3);
        for (const columna of sensibles) {
          if (columna.nombre.endsWith('_hmac')) expect(columna.tipoUdt, columna.nombre).toBe('text');
          else expect({ nombre: columna.nombre, tipo: columna.tipoUdt }).toEqual({ nombre: expect.stringMatching(/_ciphertext$/), tipo: 'bytea' });
        }
      }
    } finally {
      await cliente.end();
    }
  });
});
