import { describe, expect, inject, it } from 'vitest';
import { columnasDe } from '../../support/catalogo.js';
import { conectar, conTransaccionRevertida, esperarRechazo } from '../../support/db.js';
import {
  filaDeIdentidad,
  filaDePaciente,
  generadorDeIds,
  insertar,
  sqlInsertar,
} from '../../support/filas-sinteticas.js';

const urlBase = inject('urlBaseDeTest');
// Espacio de ids propio de este archivo (los archivos corren en paralelo sobre una sola base).
const ESPACIO_DE_IDS = 4;
const hmacCompartido = 'hmac-sintetico-compartido-identidad';

describe('identity.patient_identity', () => {
  it.each([
    ['con país emisor', 'CO'],
    ['con país emisor nulo', null],
  ])(
    'rechaza por el índice ciego único la segunda identidad con el mismo id_type, país y HMAC %s [US-038 AC-6]',
    async (_caso, pais) => {
      await conTransaccionRevertida(urlBase, async (cliente) => {
        const ids = generadorDeIds(ESPACIO_DE_IDS);
        const primero = await insertar(cliente, 'clinical.patient', filaDePaciente(ids));
        const segundo = await insertar(cliente, 'clinical.patient', filaDePaciente(ids));
        await insertar(
          cliente,
          'identity.patient_identity',
          filaDeIdentidad(primero.id as string, {
            issuing_country: pais,
            national_id_hmac: hmacCompartido,
          }),
        );
        const { sql, valores } = sqlInsertar(
          'identity.patient_identity',
          filaDeIdentidad(segundo.id as string, {
            issuing_country: pais,
            national_id_hmac: hmacCompartido,
          }),
        );

        const error = await esperarRechazo(cliente, sql, valores);

        expect(error.code).toBe('23505');
        expect(error.constraint).toBe('patient_identity_blind_index_uq');
      });
    },
  );

  it('admite la misma identidad en otro país porque la unicidad incluye issuing_country [US-038 AC-6]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const primero = await insertar(cliente, 'clinical.patient', filaDePaciente(ids));
      const segundo = await insertar(cliente, 'clinical.patient', filaDePaciente(ids));
      await insertar(
        cliente,
        'identity.patient_identity',
        filaDeIdentidad(primero.id as string, {
          issuing_country: 'CO',
          national_id_hmac: hmacCompartido,
        }),
      );

      const otra = await insertar(
        cliente,
        'identity.patient_identity',
        filaDeIdentidad(segundo.id as string, {
          issuing_country: 'PE',
          national_id_hmac: hmacCompartido,
        }),
      );

      expect(otra.issuing_country).toBe('PE');
    });
  });

  // Lista LITERAL de columnas de data-model.md §4.2: una columna en claro nueva en identity rompe este test.
  const COLUMNAS_DE_IDENTIDAD: Array<[string, Array<[string, string]>]> = [
    [
      'patient_identity',
      [
        ['patient_id', 'uuid'],
        ['id_type', 'id_type'],
        ['issuing_country', 'text'],
        ['national_id_ciphertext', 'bytea'],
        ['national_id_hmac', 'text'],
        ['full_name_ciphertext', 'bytea'],
        ['key_version', 'int4'],
        ['full_name_hmac', 'text'],
      ],
    ],
    [
      'legal_representative',
      [
        ['id', 'uuid'],
        ['patient_id', 'uuid'],
        ['relationship', 'relationship'],
        ['id_type', 'id_type'],
        ['national_id_ciphertext', 'bytea'],
        ['national_id_hmac', 'text'],
        ['full_name_ciphertext', 'bytea'],
        ['registered_at', 'timestamptz'],
        ['valid_from', 'date'],
        ['valid_until', 'date'],
      ],
    ],
  ];

  it.each(COLUMNAS_DE_IDENTIDAD)(
    'guarda documento y nombre solo como bytea *_ciphertext cuando se listan las columnas de identity.%s [US-038 AC-6]',
    async (tabla, esperadas) => {
      const cliente = await conectar(urlBase);
      try {
        const columnas = await columnasDe(cliente, 'identity', tabla);

        expect(columnas.map((c) => [c.nombre, c.tipoUdt])).toEqual(esperadas);
      } finally {
        await cliente.end();
      }
    },
  );
});
