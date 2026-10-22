import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idDePaciente } from '../../support/gateway.js';
import {
  iniciarEscenarioDePacientes,
  montarPacientes,
  type EscenarioDePacientes,
} from '../../support/pacientes.js';
import { abrirSesionDeUsuarioConRol, crearRolDePrueba } from '../../support/roles.js';
import { contrasenaDeTest } from '../../support/usuarios.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 2031;
const TOKEN_SIN_PERMISOS = 'SINT-cookie-sin-permisos-ficha-0001';
let escenario: EscenarioDePacientes;
let cookieSinPermisos: string;

beforeAll(async () => {
  escenario = await iniciarEscenarioDePacientes('pac_ficha_admin', ESPACIO_DE_IDS);
  const { mundo } = escenario;
  const rolId = await crearRolDePrueba(mundo.cliente, mundo.ids, 'sin_ficha', [
    'ai_analysis:create',
  ]);
  ({ cookie: cookieSinPermisos } = await abrirSesionDeUsuarioConRol(mundo.cliente, mundo.ids, {
    email: `sin-ficha-${ESPACIO_DE_IDS}@example.invalid`,
    password: contrasenaDeTest('TEST_DOC1_PASSWORD'),
    rolId,
    tokenHash: createHash('sha256').update(TOKEN_SIN_PERMISOS).digest('hex'),
    token: TOKEN_SIN_PERMISOS,
  }));
});
afterAll(() => escenario.cerrar());

/** Una ficha pedida con la conexión instrumentada: devuelve la respuesta y el SQL que llegó al módulo. */
async function pedirFichaConSql(id: string, cookie: string) {
  const consultas: string[] = [];
  const db = {
    query: (sql: string, valores?: unknown[]) => {
      consultas.push(sql);
      return escenario.mundo.cliente.query(sql, valores);
    },
  };
  const { app } = montarPacientes(escenario.mundo, { db });
  const respuesta = await clienteVerificado(app)
    .get(`/platform/patients/${id}`)
    .set('Cookie', cookie);
  return { respuesta, consultas };
}

const TABLAS_CLINICAS = [
  'clinical.diagnosis',
  'clinical.biomarker',
  'clinical.exam',
  'clinical.clinical_note',
  'clinical.prior_treatment',
  'clinical.clinical_event',
  'clinical.clinical_attribute',
  'clinical.care_team_member',
];

describe('ficha del paciente: admin', () => {
  it('entrega al admin 200 PatientAdminSummary sin datos clínicos ni nombre y sin leer tablas clínicas [US-045 AC-6]', async () => {
    const { respuesta, consultas } = await pedirFichaConSql(
      idDePaciente('a'),
      escenario.cookieAdmin,
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({
      view: 'admin',
      id: idDePaciente('a'),
      nationalIdMasked: '•••• 01',
      dataOrigin: 'sintetico',
    });
    for (const campo of ['diagnosis', 'recentBiomarkers', 'identification', 'fullNameMasked']) {
      expect(respuesta.body).not.toHaveProperty(campo);
    }
    expect(JSON.stringify(respuesta.body)).not.toContain('Prueba Sintética');
    expect(consultas.length).toBeGreaterThan(0);
    for (const sql of consultas) {
      for (const tabla of TABLAS_CLINICAS) expect(sql).not.toContain(tabla);
    }
  });

  it('responde 403 PERMISO_DENEGADO cuando el rol no tiene clinical:read ni patients:lookup [US-045 AC-6]', async () => {
    const { respuesta } = await pedirFichaConSql(idDePaciente('a'), cookieSinPermisos);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error).toBe('PERMISO_DENEGADO');
    expect(JSON.stringify(respuesta.body)).not.toContain('SINT-0000001');
  });
});

describe('pendingReviewCount de la ficha', () => {
  const cambiarEstadoDeHer2 = (estado: string) =>
    escenario.mundo.cliente.query(
      `UPDATE clinical.biomarker SET review_status = $2
        WHERE name = 'HER2' AND exam_id IN (SELECT id FROM clinical.exam WHERE patient_id = $1)`,
      [idDePaciente('a'), estado],
    );
  const pendientes = async (): Promise<number> => {
    const { respuesta } = await pedirFichaConSql(idDePaciente('a'), escenario.cookieDoctor);
    return respuesta.body.pendingReviewCount;
  };

  it('es 0 con todo verificado y 1 tras pasar un biomarcador a requiere_revision [US-051 AC-6]', async () => {
    const antes = await pendientes();
    await cambiarEstadoDeHer2('requiere_revision');
    const despues = await pendientes();
    await cambiarEstadoDeHer2('verificado');

    expect(antes).toBe(0);
    expect(despues).toBe(1);
  });

  it('no cuenta auto_aceptado y deja el estado de la fila como dato [US-051 AC-6]', async () => {
    await cambiarEstadoDeHer2('auto_aceptado');
    const { respuesta } = await pedirFichaConSql(idDePaciente('a'), escenario.cookieDoctor);
    await cambiarEstadoDeHer2('verificado');

    expect(respuesta.body.pendingReviewCount).toBe(0);
    const her2 = respuesta.body.recentBiomarkers.find((b: { name: string }) => b.name === 'HER2');
    expect(her2.provenance.reviewStatus).toBe('auto_aceptado');
  });

  it('excluye los biomarcadores rechazado y reemplazado de la ficha y del contador [RN-07]', async () => {
    await cambiarEstadoDeHer2('rechazado');
    const { respuesta } = await pedirFichaConSql(idDePaciente('a'), escenario.cookieDoctor);
    await cambiarEstadoDeHer2('verificado');

    expect(respuesta.body.pendingReviewCount).toBe(0);
    const nombres = respuesta.body.recentBiomarkers.map((b: { name: string }) => b.name);
    expect(nombres).not.toContain('HER2');
  });
});
