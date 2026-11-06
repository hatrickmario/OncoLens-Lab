import { describe, expect, inject, it } from 'vitest';
import { conTransaccionRevertida, esperarRechazo } from '../../support/db.js';
import {
  FECHA_FIJA,
  INSTANTE_FIJO,
  generadorDeIds,
  insertar,
  insertarContextoClinico,
  type Fila,
  type GeneradorDeIds,
} from '../../support/filas-sinteticas.js';

const urlBase = inject('urlBaseDeTest');
// Espacio de ids propio de este archivo (los archivos corren en paralelo sobre una sola base).
const ESPACIO_DE_IDS = 9991;

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

interface Contexto {
  readonly patientId: string;
  readonly episodeId: string;
}

function filaDeTratamiento(ids: GeneradorDeIds, contexto: Contexto, resto: Fila = {}): Fila {
  return {
    id: ids(),
    patient_id: contexto.patientId,
    episode_id: contexto.episodeId,
    setting: 'adyuvante',
    regimen_name: 'AC-T',
    atc_codes: [],
    mapping_status: 'no_mapeado',
    ongoing: false,
    end_reason: 'completado',
    entry_method: 'manual',
    extraction_confidence: 'n_a',
    review_status: 'verificado',
    created_at: INSTANTE_FIJO,
    ...resto,
  };
}

function filaDeAtributo(ids: GeneradorDeIds, contexto: Contexto, resto: Fila = {}): Fila {
  return {
    id: ids(),
    patient_id: contexto.patientId,
    episode_id: contexto.episodeId,
    attribute_key: 'estado_menopausico',
    value: 'posmenopausica',
    observed_at: FECHA_FIJA,
    date_precision: 'dia',
    entry_method: 'manual',
    extraction_confidence: 'n_a',
    review_status: 'verificado',
    created_at: INSTANTE_FIJO,
    ...resto,
  };
}

describe('supersedes_id de clinical.prior_treatment y clinical.clinical_attribute (ADR-50)', () => {
  it('deja supersedes_id nulo en las filas que se insertan como antes de la migración [d5fb-05 data-model]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const contexto = await insertarContextoClinico(cliente, ids);

      const tratamiento = await insertar(
        cliente,
        'clinical.prior_treatment',
        filaDeTratamiento(ids, contexto),
      );
      const atributo = await insertar(
        cliente,
        'clinical.clinical_attribute',
        filaDeAtributo(ids, contexto),
      );

      expect([tratamiento['supersedes_id'], atributo['supersedes_id']]).toEqual([null, null]);
    });
  });

  it('rechaza reemplazar dos veces la misma fila por el índice único parcial [d5fb-05 data-model]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const contexto = await insertarContextoClinico(cliente, ids);
      const tratamiento = await insertar(
        cliente,
        'clinical.prior_treatment',
        filaDeTratamiento(ids, contexto),
      );
      const atributo = await insertar(
        cliente,
        'clinical.clinical_attribute',
        filaDeAtributo(ids, contexto),
      );
      await insertar(
        cliente,
        'clinical.prior_treatment',
        filaDeTratamiento(ids, contexto, { supersedes_id: tratamiento['id'] }),
      );
      await insertar(
        cliente,
        'clinical.clinical_attribute',
        filaDeAtributo(ids, contexto, { supersedes_id: atributo['id'] }),
      );

      const segundoTratamiento = await esperarRechazo(
        cliente,
        'INSERT INTO clinical.prior_treatment (id, patient_id, episode_id, setting, regimen_name, atc_codes, mapping_status, ongoing, end_reason, entry_method, extraction_confidence, review_status, created_at, supersedes_id) SELECT $1, patient_id, episode_id, setting, regimen_name, atc_codes, mapping_status, ongoing, end_reason, entry_method, extraction_confidence, review_status, created_at, $2 FROM clinical.prior_treatment WHERE id = $2',
        [ids(), tratamiento['id']],
      );
      const segundoAtributo = await esperarRechazo(
        cliente,
        'INSERT INTO clinical.clinical_attribute (id, patient_id, episode_id, attribute_key, value, observed_at, date_precision, entry_method, extraction_confidence, review_status, created_at, supersedes_id) SELECT $1, patient_id, episode_id, attribute_key, value, observed_at, date_precision, entry_method, extraction_confidence, review_status, created_at, $2 FROM clinical.clinical_attribute WHERE id = $2',
        [ids(), atributo['id']],
      );

      expect(segundoTratamiento.code).toBe(UNIQUE_VIOLATION);
      expect(segundoTratamiento.constraint).toBe('prior_treatment_supersedes_id_uq');
      expect(segundoAtributo.code).toBe(UNIQUE_VIOLATION);
      expect(segundoAtributo.constraint).toBe('clinical_attribute_supersedes_id_uq');
    });
  });

  it('rechaza un supersedes_id inexistente por la clave foránea [d5fb-05 data-model]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const contexto = await insertarContextoClinico(cliente, ids);
      const inexistente = ids();

      const rechazoTratamiento = await esperarRechazo(
        cliente,
        'INSERT INTO clinical.prior_treatment (id, patient_id, episode_id, setting, regimen_name, atc_codes, mapping_status, ongoing, end_reason, entry_method, extraction_confidence, review_status, created_at, supersedes_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
        [
          ...[ids(), contexto.patientId, contexto.episodeId, 'adyuvante', 'FEC', []],
          ...['no_mapeado', false, 'completado', 'manual_correction', 'n_a', 'verificado'],
          ...[INSTANTE_FIJO, inexistente],
        ],
      );
      const rechazoAtributo = await esperarRechazo(
        cliente,
        'INSERT INTO clinical.clinical_attribute (id, patient_id, episode_id, attribute_key, value, date_precision, entry_method, extraction_confidence, review_status, created_at, supersedes_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [
          ...[ids(), contexto.patientId, contexto.episodeId, 'estado_menopausico'],
          ...['premenopausica', 'incierta', 'manual_correction', 'n_a', 'verificado'],
          ...[INSTANTE_FIJO, inexistente],
        ],
      );

      expect(rechazoTratamiento.code).toBe(FOREIGN_KEY_VIOLATION);
      expect(rechazoTratamiento.constraint).toBe('prior_treatment_supersedes_id_fkey');
      expect(rechazoAtributo.code).toBe(FOREIGN_KEY_VIOLATION);
      expect(rechazoAtributo.constraint).toBe('clinical_attribute_supersedes_id_fkey');
    });
  });

  it('permite varias filas sin supersedes_id para el mismo paciente [d5fb-05 data-model]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const contexto = await insertarContextoClinico(cliente, ids);

      await insertar(cliente, 'clinical.prior_treatment', filaDeTratamiento(ids, contexto));
      await insertar(cliente, 'clinical.prior_treatment', filaDeTratamiento(ids, contexto));

      const { rows } = await cliente.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM clinical.prior_treatment WHERE patient_id = $1 AND supersedes_id IS NULL',
        [contexto.patientId],
      );
      expect(rows[0]?.n).toBe(2);
    });
  });
});
