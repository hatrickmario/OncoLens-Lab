import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idDePaciente } from '../../support/gateway.js';
import {
  iniciarEscenarioDePacientes,
  montarPacientes,
  type EscenarioDePacientes,
} from '../../support/pacientes.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 2030;
/** UUID válido que ningún test ni el seed crean. */
const PACIENTE_INEXISTENTE = '00000000-0000-4000-8000-00000000dead';
let escenario: EscenarioDePacientes;

beforeAll(async () => {
  escenario = await iniciarEscenarioDePacientes('pac_ficha', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

function pedirFicha(id: string, cookie: string | null = escenario.cookieDoctor) {
  const { app } = montarPacientes(escenario.mundo);
  const peticion = clienteVerificado(app).get(`/platform/patients/${id}`);
  return cookie === null ? peticion : peticion.set('Cookie', cookie);
}

interface BiomarcadorDeLaFicha {
  name: string;
  value: string;
  unit: string | null;
  trend: string | null;
  referenceRange: string | null;
  clinicalSignificance: string;
  provenance: { entryMethod: string; reviewStatus: string };
}

describe('ficha del paciente: doctor', () => {
  it('responde 200 con PatientSummary del paciente semilla (a), identidad descifrada, mama TNM_8 IIA ECOG 1 y HER2 3+ y RE positivo con provenance cuando doc1 pide su ficha [US-051 AC-1]', async () => {
    const respuesta = await pedirFicha(idDePaciente('a'));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({
      view: 'doctor',
      id: idDePaciente('a'),
      identification: {
        idType: 'sintetico',
        nationalId: 'SINT-0000001',
        fullName: 'Prueba Sintética 1',
      },
      dataOrigin: 'sintetico',
      diagnosis: {
        cancerType: 'mama',
        stagingSystem: 'TNM_8',
        stageValue: 'IIA',
        performanceScale: 'ECOG',
        performanceValue: 1,
        isActive: true,
      },
    });
    const biomarcadores: BiomarcadorDeLaFicha[] = respuesta.body.recentBiomarkers;
    const her2 = biomarcadores.find((b) => b.name === 'HER2');
    const estrogeno = biomarcadores.find((b) => b.name === 'Receptor de estrógeno');
    expect(her2).toMatchObject({ value: '3+ (IHQ)', clinicalSignificance: 'relevante' });
    expect(estrogeno?.value).toContain('Positivo');
    for (const b of [her2, estrogeno]) {
      expect(b?.provenance).toMatchObject({ entryMethod: 'seed', reviewStatus: 'verificado' });
    }
    expect(respuesta.headers['cache-control']).toBe('no-store');
  });

  it('devuelve el diagnóstico con is_active cuando el paciente (c) tiene uno inactivo y uno activo [US-051 AC-3]', async () => {
    const { rows } = await escenario.mundo.cliente.query<{ id: string }>(
      'SELECT id FROM clinical.diagnosis WHERE patient_id = $1 AND is_active',
      [idDePaciente('c')],
    );

    const respuesta = await pedirFicha(idDePaciente('c'));

    expect(respuesta.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(respuesta.body.diagnosis.id).toBe(rows[0]?.id);
    expect(respuesta.body.diagnosis.isActive).toBe(true);
  });

  it('devuelve un solo PSA, el más reciente, con trend null cuando el paciente (b) tiene tres [US-051 AC-4]', async () => {
    const respuesta = await pedirFicha(idDePaciente('b'));

    expect(respuesta.status).toBe(200);
    const psa: BiomarcadorDeLaFicha[] = respuesta.body.recentBiomarkers.filter(
      (b: BiomarcadorDeLaFicha) => b.name === 'PSA',
    );
    expect(psa).toHaveLength(1);
    expect(psa[0]).toMatchObject({ value: '12.4', unit: 'ng/mL', trend: null });
  });

  it('incluye la gradación del diagnóstico vigente con su procedencia [US-051 AC-1]', async () => {
    const respuesta = await pedirFicha(idDePaciente('b'));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.diagnosis.grade).toBe('Gleason 4+3=7 · ISUP 3');
    expect(respuesta.body.diagnosis.gradings).toHaveLength(1);
    expect(respuesta.body.diagnosis.gradings[0]).toMatchObject({
      gradingSystem: 'gleason_isup',
      specimenType: 'biopsia',
      gradeScope: 'peor',
      isReference: true,
    });
  });

  it('lee la ficha de cada paciente semilla con 200 sin consultar care_team_member [US-045 AC-4]', async () => {
    const consultas: string[] = [];
    const db = {
      query: (sql: string, valores?: unknown[]) => {
        consultas.push(sql);
        return escenario.mundo.cliente.query(sql, valores);
      },
    };
    const { app } = montarPacientes(escenario.mundo, { db });

    for (const letra of ['a', 'b', 'c', 'd', 'e'] as const) {
      const respuesta = await clienteVerificado(app)
        .get(`/platform/patients/${idDePaciente(letra)}`)
        .set('Cookie', escenario.cookieDoctor);
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.view).toBe('doctor');
    }

    expect(consultas.length).toBeGreaterThan(0);
    for (const sql of consultas) expect(sql).not.toContain('care_team_member');
  });
});

describe('ficha del paciente: errores de acceso', () => {
  it('responde 404 NO_ENCONTRADO cuando el UUID no existe [US-051 AC-2]', async () => {
    const respuesta = await pedirFicha(PACIENTE_INEXISTENTE);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error).toBe('NO_ENCONTRADO');
  });

  it('responde 404 sin consultar la BD ni repetir el valor cuando el patientId no es UUID [US-051 AC-2]', async () => {
    const consultas: string[] = [];
    const db = {
      query: (sql: string, valores?: unknown[]) => {
        consultas.push(sql);
        return escenario.mundo.cliente.query(sql, valores);
      },
    };
    const { app } = montarPacientes(escenario.mundo, { db });

    const respuesta = await clienteVerificado(app)
      .get('/platform/patients/no-es-un-uuid')
      .set('Cookie', escenario.cookieDoctor);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error).toBe('NO_ENCONTRADO');
    expect(JSON.stringify(respuesta.body)).not.toContain('no-es-un-uuid');
    expect(consultas).toEqual([]);
  });

  it('responde 401 sin datos del paciente cuando no hay sesión [US-051 AC-2]', async () => {
    const respuesta = await pedirFicha(idDePaciente('a'), null);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error).toBe('NO_AUTENTICADO');
    expect(JSON.stringify(respuesta.body)).not.toContain('SINT-0000001');
  });

  it('no registra el UUID del paciente inexistente ni el valor inválido en el log [US-051 AC-2]', async () => {
    const { app, logger } = montarPacientes(escenario.mundo);

    await clienteVerificado(app)
      .get(`/platform/patients/${PACIENTE_INEXISTENTE}`)
      .set('Cookie', escenario.cookieDoctor);
    await clienteVerificado(app)
      .get('/platform/patients/no-es-un-uuid')
      .set('Cookie', escenario.cookieDoctor);

    const texto = logger.texto();
    expect(texto).not.toContain(PACIENTE_INEXISTENTE);
    expect(texto).not.toContain('no-es-un-uuid');
    expect(logger.lineas.filter((linea) => linea['event'] === 'patients.ficha')).toHaveLength(2);
  });
});
