import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idDePaciente } from '../../support/gateway.js';
import {
  iniciarEscenarioDePacientes,
  montarPacientes,
  type EscenarioDePacientes,
} from '../../support/pacientes.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 2032;
let escenario: EscenarioDePacientes;

beforeAll(async () => {
  escenario = await iniciarEscenarioDePacientes('pac_dx_rechazado', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

interface ElementoDelListado {
  id: string;
  cancerTypeEnabled: boolean;
  pendingReviewCount: number;
}

async function enTransaccion(accion: () => Promise<void>): Promise<void> {
  const { cliente } = escenario.mundo;
  await cliente.query('BEGIN');
  try {
    await accion();
  } finally {
    await cliente.query('ROLLBACK');
  }
}

/** Listado y ficha del mismo paciente, con la misma sesión del doctor. */
async function listadoYFichaDe(letra: 'a' | 'b' | 'c') {
  const { app } = montarPacientes(escenario.mundo, { pageSize: 10 });
  const listado = await clienteVerificado(app)
    .get('/platform/patients')
    .set('Cookie', escenario.cookieDoctor);
  const ficha = await clienteVerificado(app)
    .get(`/platform/patients/${idDePaciente(letra)}`)
    .set('Cookie', escenario.cookieDoctor);
  const elemento = (listado.body.items as ElementoDelListado[]).find(
    (item) => item.id === idDePaciente(letra),
  );
  return { elemento, ficha: ficha.body };
}

describe('RN-07: un diagnóstico rechazado no es el vigente', () => {
  it('marca cancerTypeEnabled=false en el listado y en la ficha cuando el diagnóstico activo está rechazado [US-051 AC-3]', async () => {
    await enTransaccion(async () => {
      await escenario.mundo.cliente.query(
        `UPDATE clinical.diagnosis SET review_status = 'rechazado' WHERE patient_id = $1 AND is_active`,
        [idDePaciente('a')],
      );

      const { elemento, ficha } = await listadoYFichaDe('a');

      expect(ficha.diagnosis).toBeNull();
      expect(ficha.cancerTypeEnabled).toBe(false);
      expect(elemento?.cancerTypeEnabled).toBe(false);
    });
  });

  it('marca cancerTypeEnabled=true en el listado y en la ficha cuando el diagnóstico activo es válido [US-051 AC-1]', async () => {
    const { elemento, ficha } = await listadoYFichaDe('a');

    expect(ficha.cancerTypeEnabled).toBe(true);
    expect(elemento?.cancerTypeEnabled).toBe(true);
  });

  it('no cuenta una gradación en requiere_revision cuando su diagnóstico está rechazado [US-051 AC-6]', async () => {
    await enTransaccion(async () => {
      await escenario.mundo.cliente.query(
        `UPDATE clinical.diagnosis_grading SET review_status = 'requiere_revision'
          WHERE diagnosis_id IN (SELECT id FROM clinical.diagnosis WHERE patient_id = $1)`,
        [idDePaciente('a')],
      );
      await escenario.mundo.cliente.query(
        `UPDATE clinical.diagnosis SET review_status = 'rechazado' WHERE patient_id = $1`,
        [idDePaciente('a')],
      );

      const { elemento, ficha } = await listadoYFichaDe('a');

      expect(ficha.pendingReviewCount).toBe(0);
      expect(elemento?.pendingReviewCount).toBe(0);
    });
  });

  it('da el mismo pendingReviewCount en el listado y en la ficha del mismo paciente [US-051 AC-6]', async () => {
    await enTransaccion(async () => {
      await escenario.mundo.cliente.query(
        `UPDATE clinical.biomarker SET review_status = 'requiere_revision'
          WHERE exam_id IN (SELECT id FROM clinical.exam WHERE patient_id = $1)`,
        [idDePaciente('a')],
      );

      const { elemento, ficha } = await listadoYFichaDe('a');

      expect(ficha.pendingReviewCount).toBeGreaterThan(0);
      expect(elemento?.pendingReviewCount).toBe(ficha.pendingReviewCount);
    });
  });
});
