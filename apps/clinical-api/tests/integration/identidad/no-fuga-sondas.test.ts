import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { conectar, crearBaseDeTest, leerConfiguracionArnes, type BaseDeTest } from '../../support/db.js';
import {
  filaDeAnalisisSinEvidencia,
  generadorDeIds,
  insertar,
  insertarContextoClinico,
  INSTANTE_FIJO,
} from '../../support/filas-sinteticas.js';
import { FX_T4A_A } from '../../support/identidad.js';
import { buscarFugaDeIdentidad, fuentesDeBaseDeDatos } from '../../support/no-fuga.js';

/**
 * Sondas del arnés sobre las tablas de salida: se INYECTA el valor en `audit.*`, `research.*` o
 * `clinical.ai_analysis_record` y el arnés debe verlo. Prueban que `fuentesDeBaseDeDatos` realmente lee esas tablas.
 */
describe('fuentesDeBaseDeDatos: sondas de fuga en las tablas de salida', () => {
  let base: BaseDeTest;
  let cliente: Client;
  const ids = generadorDeIds(14);

  beforeAll(async () => {
    base = await crearBaseDeTest(leerConfiguracionArnes(process.env), `ident_sondas_${process.pid}`);
    cliente = await conectar(base.url);
  });
  afterAll(async () => {
    await cliente.end();
    await base.destruir();
  });

  const buscar = async () =>
    buscarFugaDeIdentidad([FX_T4A_A.numeroDeDocumento], await fuentesDeBaseDeDatos(cliente));

  it('no encuentra nada cuando las tablas de salida no contienen la identidad', async () => {
    expect(await buscar()).toEqual([]);
  });

  it('detecta el documento inyectado en audit.audit_log', async () => {
    await insertar(cliente, 'audit.audit_log', {
      id: ids(),
      user_id: null,
      action: 'sonda',
      entity_type: 'patient',
      entity_id: ids(),
      metadata: JSON.stringify({ detalle: FX_T4A_A.numeroDeDocumento }),
      ip_address: '127.0.0.1',
      created_at: INSTANTE_FIJO,
    });

    const hallazgos = await buscar();

    expect(hallazgos).toContainEqual({
      fuente: 'audit.audit_log[0]',
      valor: FX_T4A_A.numeroDeDocumento,
    });
  });

  it('detecta una clave con nombre de identidad dentro de una columna jsonb pero no el nombre de la columna ip_address', async () => {
    await insertar(cliente, 'audit.audit_log', {
      id: ids(),
      user_id: null,
      action: 'sonda-clave',
      entity_type: 'patient',
      entity_id: ids(),
      metadata: JSON.stringify({ fullName: 'x' }),
      ip_address: '127.0.0.1',
      created_at: INSTANTE_FIJO,
    });

    const hallazgos = await buscar();

    expect(hallazgos.filter((hallazgo) => hallazgo.valor.startsWith('clave:'))).toEqual([
      { fuente: expect.stringMatching(/^audit\.audit_log\[\d\]\.metadata$/) as string, valor: 'clave:fullName' },
    ]);
  });

  it('detecta el documento inyectado en research.episode_snapshot', async () => {
    await insertar(cliente, 'research.episode_snapshot', {
      id: ids(),
      research_subject_id: ids(),
      episode_seq: 1,
      snapshot_schema_version: 1,
      snapshot: JSON.stringify({ texto: `CC ${FX_T4A_A.numeroDeDocumento}` }),
      created_at: INSTANTE_FIJO,
    });

    const hallazgos = await buscar();

    expect(hallazgos.map((hallazgo) => hallazgo.fuente)).toContain('research.episode_snapshot[0]');
  });

  it('detecta el documento inyectado en clinical.ai_analysis_record', async () => {
    const contexto = await insertarContextoClinico(cliente, ids);
    await insertar(
      cliente,
      'clinical.ai_analysis_record',
      filaDeAnalisisSinEvidencia(ids, contexto.patientId, contexto.episodeId, contexto.userId, {
        synthesis: JSON.stringify({ texto: `CC ${FX_T4A_A.numeroDeDocumento}` }),
      }),
    );

    const hallazgos = await buscar();

    expect(hallazgos.map((hallazgo) => hallazgo.fuente)).toContain('clinical.ai_analysis_record[0]');
  });
});
