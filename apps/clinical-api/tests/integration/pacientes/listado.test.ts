import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idDePaciente } from '../../support/gateway.js';
import {
  PAGE_SIZE_DE_TEST,
  iniciarEscenarioDePacientes,
  montarPacientes,
  type EscenarioDePacientes,
} from '../../support/pacientes.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 2020;
let escenario: EscenarioDePacientes;

beforeAll(async () => {
  escenario = await iniciarEscenarioDePacientes('pac_listado', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

describe('listado de pacientes', () => {
  it('devuelve la página 1 con pageSize, total 5 y dataOrigin y lifecycleStatus en cada elemento [US-048 AC-1]', async () => {
    const { app } = montarPacientes(escenario.mundo);

    const respuesta = await clienteVerificado(app)
      .get('/platform/patients?page=1')
      .set('Cookie', escenario.cookieDoctor);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.page).toBe(1);
    expect(respuesta.body.pageSize).toBe(PAGE_SIZE_DE_TEST);
    expect(respuesta.body.total).toBe(5);
    expect(respuesta.body.items).toHaveLength(PAGE_SIZE_DE_TEST);
    for (const elemento of respuesta.body.items) {
      expect(elemento).toMatchObject({
        view: 'doctor_listado',
        dataOrigin: 'sintetico',
        lifecycleStatus: 'activo',
      });
    }
  });

  it('filtra a vacío con dataOrigin=real_identificado y a cinco con status=activo [US-048 AC-4]', async () => {
    const { app } = montarPacientes(escenario.mundo, { pageSize: 10 });

    const reales = await clienteVerificado(app)
      .get('/platform/patients?dataOrigin=real_identificado')
      .set('Cookie', escenario.cookieDoctor);
    const activos = await clienteVerificado(app)
      .get('/platform/patients?status=activo')
      .set('Cookie', escenario.cookieDoctor);

    expect(reales.status).toBe(200);
    expect(reales.body).toMatchObject({ items: [], total: 0 });
    expect(activos.status).toBe(200);
    expect(activos.body.total).toBe(5);
    expect(activos.body.items).toHaveLength(5);
  });

  it('responde 422 sin eco del valor cuando status está fuera del enum [US-048 AC-4]', async () => {
    const { app } = montarPacientes(escenario.mundo);

    const respuesta = await clienteVerificado(app)
      .get('/platform/patients?status=borrado')
      .set('Cookie', escenario.cookieDoctor);

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    expect(JSON.stringify(respuesta.body)).not.toContain('borrado');
  });

  it('responde 422 cuando la query trae un parámetro que no es un filtro sin identidad [US-048 AC-5]', async () => {
    const { app } = montarPacientes(escenario.mundo);

    const respuesta = await clienteVerificado(app)
      .get('/platform/patients?nationalId=SINT-0000001')
      .set('Cookie', escenario.cookieDoctor);

    expect(respuesta.status).toBe(422);
    expect(JSON.stringify(respuesta.body)).not.toContain('SINT-0000001');
  });

  it('responde 401 sin datos cuando falta la cookie [US-048 AC-6]', async () => {
    const { app } = montarPacientes(escenario.mundo);

    const respuesta = await clienteVerificado(app).get('/platform/patients');

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error).toBe('NO_AUTENTICADO');
    expect(respuesta.body.items).toBeUndefined();
  });

  it('entrega al admin PatientAdminSummary en el listado [US-048 AC-7]', async () => {
    const { app } = montarPacientes(escenario.mundo);

    const respuesta = await clienteVerificado(app)
      .get('/platform/patients')
      .set('Cookie', escenario.cookieAdmin);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.items.length).toBeGreaterThan(0);
    for (const elemento of respuesta.body.items) {
      expect(elemento.view).toBe('admin');
      expect(elemento).not.toHaveProperty('fullNameMasked');
      expect(elemento).not.toHaveProperty('pendingReviewCount');
      expect(elemento).not.toHaveProperty('missingCriticalCount');
    }
  });

  it('devuelve los dos pacientes restantes en la página 2 sin repetir los de la página 1 [US-048 AC-1]', async () => {
    const { app } = montarPacientes(escenario.mundo);
    const pedir = (pagina: number) =>
      clienteVerificado(app)
        .get(`/platform/patients?page=${pagina}`)
        .set('Cookie', escenario.cookieDoctor);

    const primera = await pedir(1);
    const segunda = await pedir(2);

    const ids = (cuerpo: { items: { id: string }[] }) =>
      cuerpo.items.map((elemento) => elemento.id);
    expect(segunda.body.page).toBe(2);
    expect(ids(segunda.body)).toHaveLength(2);
    expect(new Set([...ids(primera.body), ...ids(segunda.body)]).size).toBe(5);
  });

  it('responde 422 cuando page es 0 [US-048 AC-4]', async () => {
    const { app } = montarPacientes(escenario.mundo);

    const respuesta = await clienteVerificado(app)
      .get('/platform/patients?page=0')
      .set('Cookie', escenario.cookieDoctor);

    expect(respuesta.status).toBe(422);
  });

  it('responde Cache-Control: no-store y marca habilitado el tipo de cáncer de cada paciente semilla [US-048 AC-1]', async () => {
    const { app } = montarPacientes(escenario.mundo);

    const respuesta = await clienteVerificado(app)
      .get('/platform/patients')
      .set('Cookie', escenario.cookieDoctor);

    expect(respuesta.headers['cache-control']).toBe('no-store');
    for (const elemento of respuesta.body.items) {
      expect(elemento.missingCriticalCount).toBe(0);
      expect(elemento.cancerTypeEnabled).toBe(true);
    }
  });

  it('cuenta en pendingReviewCount los datos clínicos en requiere_revision del paciente [US-048 AC-1]', async () => {
    const paciente = idDePaciente('a');
    const { app } = montarPacientes(escenario.mundo, { pageSize: 10 });
    const pendientesDe = async (): Promise<number> => {
      const respuesta = await clienteVerificado(app)
        .get('/platform/patients')
        .set('Cookie', escenario.cookieDoctor);
      return respuesta.body.items.find((elemento: { id: string }) => elemento.id === paciente)
        .pendingReviewCount;
    };
    const antes = await pendientesDe();
    await escenario.mundo.cliente.query(
      `UPDATE clinical.diagnosis SET review_status = 'requiere_revision' WHERE patient_id = $1`,
      [paciente],
    );
    const { rows } = await escenario.mundo.cliente.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM clinical.diagnosis WHERE patient_id = $1 AND review_status = 'requiere_revision'`,
      [paciente],
    );

    const despues = await pendientesDe();

    expect(antes).toBe(0);
    expect(rows[0]?.n).toBeGreaterThan(0);
    expect(despues).toBe(rows[0]?.n);
  });

  it('no consulta diagnósticos ni datos clínicos cuando lista el admin [US-048 AC-7]', async () => {
    const consultas: string[] = [];
    const db = {
      query: (sql: string, valores?: unknown[]) => {
        consultas.push(sql);
        return escenario.mundo.cliente.query(sql, valores);
      },
    };
    const { app } = montarPacientes(escenario.mundo, { db });

    const respuesta = await clienteVerificado(app)
      .get('/platform/patients')
      .set('Cookie', escenario.cookieAdmin);

    expect(respuesta.status).toBe(200);
    const sqlDelListado = consultas.filter((sql) => sql.includes('clinical.patient'));
    expect(sqlDelListado.length).toBeGreaterThan(0);
    for (const sql of consultas) expect(sql).not.toContain('clinical.diagnosis');
  });
});
