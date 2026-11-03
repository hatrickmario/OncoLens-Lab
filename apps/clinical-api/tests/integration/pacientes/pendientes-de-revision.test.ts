import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  sembrarEventoReflejoDeAnalisis,
  sembrarPCaso,
  type PCasoSembrado,
} from '../../support/caso.js';
import { prepararSiembra } from '../../support/completitud.js';
import {
  FECHA_FIJA,
  INSTANTE_FIJO,
  generadorDeIds,
  insertar,
} from '../../support/filas-sinteticas.js';
import { FX_T4A_A, servicioDeIdentidad } from '../../support/identidad.js';
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

describe('pendingReviewCount de eventos sin fecha confiable', () => {
  /** P-CASO con identidad sintética dentro de una transacción que se deshace: no contamina a los demás tests. */
  async function conPCaso(
    espacio: number,
    numeroDeDocumento: string,
    cuerpo: (patientId: string, toxicidadId: string, p: PCasoSembrado) => Promise<void>,
  ): Promise<void> {
    const { cliente } = escenario.mundo;
    await cliente.query('BEGIN');
    try {
      const contexto = await prepararSiembra(cliente, generadorDeIds(ESPACIO_DE_IDS + 500));
      const p = await sembrarPCaso(contexto, { espacio });
      await servicioDeIdentidad(cliente).guardar({
        patientId: p.patientId,
        idType: FX_T4A_A.idType,
        issuingCountry: null,
        numeroDeDocumento,
        nombreCompleto: FX_T4A_A.nombreCompleto,
      });
      await cuerpo(p.patientId, p.filas.toxicidad, p);
    } finally {
      await cliente.query('ROLLBACK');
    }
  }

  const pendientesDeLaFicha = async (patientId: string): Promise<number> => {
    const { app } = montarPacientes(escenario.mundo);
    const respuesta = await clienteVerificado(app)
      .get(`/platform/patients/${patientId}`)
      .set('Cookie', escenario.cookieDoctor);
    expect(respuesta.status).toBe(200);
    return respuesta.body.pendingReviewCount;
  };

  it('cuenta una vez la toxicidad incierta de P-CASO en pendingReviewCount antes y después de pasar a verificado [US-088 AC-3]', async () => {
    await conPCaso(7450, FX_T4A_A.numeroDeDocumento, async (patientId, toxicidadId) => {
      const antes = await pendientesDeLaFicha(patientId);
      await escenario.mundo.cliente.query(
        "UPDATE clinical.clinical_event SET review_status = 'verificado' WHERE id = $1",
        [toxicidadId],
      );
      const despues = await pendientesDeLaFicha(patientId);

      // PSA del 2026-07-15 (requiere_revision) + la toxicidad incierta, una sola vez cada una.
      expect(antes).toBe(2);
      expect(despues).toBe(2);
    });
  });

  it('no cuenta un evento incierto rechazado en pendingReviewCount [US-088 AC-3] [RN-07]', async () => {
    await conPCaso(7451, FX_T4A_A.numeroDistinto, async (patientId, toxicidadId) => {
      await escenario.mundo.cliente.query(
        "UPDATE clinical.clinical_event SET review_status = 'rechazado' WHERE id = $1",
        [toxicidadId],
      );

      // Solo el PSA por revisar: la cirugía rechazada y la toxicidad rechazada no cuentan.
      expect(await pendientesDeLaFicha(patientId)).toBe(1);
    });
  });

  it('cuenta una vez un evento vigente con event_date NULL aunque su precisión sea dia, igual que su posición sin fecha en el timeline [US-088 AC-3]', async () => {
    await conPCaso(7452, FX_T4A_A.numeroDeDocumento, async (patientId, toxicidadId) => {
      await escenario.mundo.cliente.query(
        "UPDATE clinical.clinical_event SET review_status = 'verificado', date_precision = 'dia', event_date = NULL WHERE id = $1",
        [toxicidadId],
      );

      expect(await pendientesDeLaFicha(patientId)).toBe(2);
    });
  });

  it('no suma en pendingReviewCount un evento con analysis_id [US-088 AC-5] [ADR-32]', async () => {
    await conPCaso(7453, FX_T4A_A.numeroDistinto, async (patientId, _toxicidadId, p) => {
      await sembrarEventoReflejoDeAnalisis(p, generadorDeIds(7454)(), 'requiere_revision');

      expect(await pendientesDeLaFicha(patientId)).toBe(2);
    });
  });
});
