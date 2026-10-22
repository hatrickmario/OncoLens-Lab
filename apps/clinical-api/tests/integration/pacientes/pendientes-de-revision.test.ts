import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FECHA_FIJA, INSTANTE_FIJO, insertar } from '../../support/filas-sinteticas.js';
import { idDePaciente } from '../../support/gateway.js';
import { FUENTES_POR_REVISAR } from '../../../src/modules/patients/patients.repository.js';
import {
  iniciarEscenarioDePacientes,
  montarPacientes,
  type EscenarioDePacientes,
} from '../../support/pacientes.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 2028;
let escenario: EscenarioDePacientes;

beforeAll(async () => {
  escenario = await iniciarEscenarioDePacientes('pac_pendientes', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

/**
 * Cómo llega cada tabla a su paciente, escrito aparte del catálogo de producción para que el conteo exacto compare
 * dos formulaciones independientes de la misma regla.
 */
const PACIENTE_DE_LA_TABLA: Record<string, string> = {
  diagnosis: 'SELECT patient_id, count(*)::int AS n FROM clinical.diagnosis GROUP BY patient_id',
  diagnosis_grading:
    'SELECT d.patient_id, count(*)::int AS n FROM clinical.diagnosis_grading g JOIN clinical.diagnosis d ON d.id = g.diagnosis_id GROUP BY d.patient_id',
  clinical_note:
    'SELECT patient_id, count(*)::int AS n FROM clinical.clinical_note GROUP BY patient_id',
  biomarker:
    'SELECT e.patient_id, count(*)::int AS n FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id GROUP BY e.patient_id',
  prior_treatment:
    'SELECT patient_id, count(*)::int AS n FROM clinical.prior_treatment GROUP BY patient_id',
  clinical_event:
    'SELECT patient_id, count(*)::int AS n FROM clinical.clinical_event GROUP BY patient_id',
  clinical_attribute:
    'SELECT patient_id, count(*)::int AS n FROM clinical.clinical_attribute GROUP BY patient_id',
};

const TABLAS_DEL_CATALOGO = FUENTES_POR_REVISAR.map((fuente) => fuente.tabla);

interface ElementoDelListado {
  id: string;
  pendingReviewCount: number;
}

/** El seed no trae notas clínicas: se inserta una (dentro de la transacción del test) al paciente semilla (a). */
async function asegurarUnaFila(tabla: string): Promise<void> {
  if (tabla !== 'clinical_note') return;
  const { cliente, ids } = escenario.mundo;
  const { rows } = await cliente.query<{ id: string; episode_id: string; opened_by: string }>(
    'SELECT id, id AS episode_id, opened_by FROM clinical.care_episode WHERE patient_id = $1 LIMIT 1',
    [idDePaciente('a')],
  );
  const episodio = rows[0];
  await insertar(cliente, 'clinical.clinical_note', {
    id: ids(),
    patient_id: idDePaciente('a'),
    episode_id: episodio?.id,
    created_by: episodio?.opened_by,
    note_type: 'nota_libre',
    entry_method: 'seed',
    content: 'Nota sintética de prueba.',
    recorded_at: FECHA_FIJA,
    is_active: true,
    extraction_confidence: 'n_a',
    review_status: 'verificado',
    created_at: INSTANTE_FIJO,
  });
}

describe('pendingReviewCount por fuente', () => {
  it('cubre exactamente las tablas de clinical con review_status cuando se compara con information_schema [US-048 AC-1]', async () => {
    const { rows } = await escenario.mundo.cliente.query<{ table_name: string }>(
      `SELECT DISTINCT c.table_name FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = 'clinical' AND c.column_name = 'review_status'`,
    );

    expect(rows.map((fila) => fila.table_name).sort()).toEqual([...TABLAS_DEL_CATALOGO].sort());
    expect(Object.keys(PACIENTE_DE_LA_TABLA).sort()).toEqual([...TABLAS_DEL_CATALOGO].sort());
  });

  it.each(TABLAS_DEL_CATALOGO)(
    'cuenta cada fila en requiere_revision de %s con el conteo exacto de su paciente [US-048 AC-1]',
    async (tabla) => {
      const { cliente } = escenario.mundo;
      const { app } = montarPacientes(escenario.mundo, { pageSize: 10 });
      await cliente.query('BEGIN');
      try {
        await asegurarUnaFila(tabla);
        await cliente.query(`UPDATE clinical.${tabla} SET review_status = 'requiere_revision'`);
        const { rows } = await cliente.query<{ patient_id: string; n: number }>(
          PACIENTE_DE_LA_TABLA[tabla] ?? '',
        );
        expect(rows.length).toBeGreaterThan(0);

        const respuesta = await clienteVerificado(app)
          .get('/platform/patients')
          .set('Cookie', escenario.cookieDoctor);

        const items: ElementoDelListado[] = respuesta.body.items;
        for (const item of items) {
          const esperado = rows.find((fila) => fila.patient_id === item.id)?.n ?? 0;
          expect(item.pendingReviewCount).toBe(esperado);
        }
      } finally {
        await cliente.query('ROLLBACK');
      }
    },
  );
});
