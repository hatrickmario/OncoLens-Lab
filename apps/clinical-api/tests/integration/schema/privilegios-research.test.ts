import { describe, expect, inject, it } from 'vitest';
import { conTransaccionRevertida, esperarRechazo, urlComoRol } from '../../support/db.js';
import { INSTANTE_FIJO, generadorDeIds } from '../../support/filas-sinteticas.js';

const urlBase = inject('urlBaseDeTest');
// Espacio de ids propio de este archivo (los archivos corren en paralelo sobre una sola base).
const ESPACIO_DE_IDS = 40;
const PERMISSION_DENIED = '42501';

const INSERTAR_SNAPSHOT = `INSERT INTO research.episode_snapshot
  (id, research_subject_id, episode_seq, snapshot_schema_version, snapshot, created_at)
  VALUES ($1, $2, 1, 1, '{"sintetico": true}', $3)`;

describe('research.episode_snapshot', () => {
  it('admite el INSERT de research_writer y rechaza su SELECT y su UPDATE con permission denied [US-040 AC-6]', async () => {
    const ids = generadorDeIds(ESPACIO_DE_IDS);
    const urlResearchWriter = urlComoRol(
      urlBase,
      'research_writer',
      'PG_RESEARCH_WRITER_PASSWORD_FILE',
    );

    await conTransaccionRevertida(urlResearchWriter, async (cliente) => {
      const insercion = await cliente.query(INSERTAR_SNAPSHOT, [ids(), ids(), INSTANTE_FIJO]);
      expect(insercion.rowCount).toBe(1);

      const lectura = await esperarRechazo(cliente, 'SELECT id FROM research.episode_snapshot');
      const actualizacion = await esperarRechazo(
        cliente,
        'UPDATE research.episode_snapshot SET episode_seq = 2',
      );

      expect(lectura.code).toBe(PERMISSION_DENIED);
      expect(actualizacion.code).toBe(PERMISSION_DENIED);
    });
  });
});
