import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../scripts/contracts/lib/responseValidator.mjs';
import {
  crearManejadorDeRegistroManual,
  type OperacionDeRegistroManual,
} from '../../lib/server/registro-manual';
import {
  crearDependenciasDeTest,
  ejemplo,
  ORIGEN_PERMITIDO,
  URL_CLINICAL_API,
} from '../support/clinical-api-simulado';
import {
  crearCorreccionesSimuladas,
  ID_PACIENTE,
  PARAMETROS_PACIENTE,
  peticionDeCorreccion,
  peticionDeLectura,
} from '../support/correcciones-simulado';

const clinicalApi = crearCorreccionesSimuladas();
const COOKIE = 'otra=x; oncolens_session=sesion-sintetica-1';
const VALIDAS = { Origin: ORIGEN_PERMITIDO, Cookie: COOKIE };
const BASE = `${URL_CLINICAL_API}/platform/patients/${ID_PACIENTE}`;
const RUTAS = {
  biomarkers: `${BASE}/biomarkers`,
  diagnoses: `${BASE}/diagnoses`,
  opciones: `${BASE}/manual-entry-options`,
} as const;

beforeAll(() => clinicalApi.iniciar());
afterEach(() => clinicalApi.reiniciar());
afterAll(() => clinicalApi.detener());

function registrar(
  operacion: Extract<OperacionDeRegistroManual, 'createManualBiomarker' | 'createManualDiagnosis'>,
  cabeceras: Record<string, string>,
  cuerpo: unknown,
  sobrescribir: Parameters<typeof crearDependenciasDeTest>[0] = {},
  parametros = PARAMETROS_PACIENTE,
) {
  const { dependencias, lineas } = crearDependenciasDeTest(sobrescribir);
  const ruta = operacion === 'createManualBiomarker' ? 'biomarkers' : 'diagnoses';
  return {
    lineas,
    respuesta: crearManejadorDeRegistroManual(dependencias, operacion)(
      peticionDeCorreccion(cabeceras, cuerpo, ruta),
      parametros,
    ),
  };
}

const BIOMARCADOR = ejemplo('biomarker-manual.json');
const DIAGNOSTICO = ejemplo('diagnosis-manual-nottingham.json');

describe('Route Handlers de los formularios de registro manual', () => {
  it('retransmite el 201 del biomarcador, reenvía solo la cookie de sesión y no sale Set-Cookie [US-111 AC-1]', async () => {
    clinicalApi.responder('post', RUTAS.biomarkers, 201, ejemplo('biomarker-corrected.json'), {
      'Set-Cookie': 'interna=1',
    });

    const { respuesta } = registrar('createManualBiomarker', VALIDAS, BIOMARCADOR);
    const recibida = await respuesta;

    expect(recibida.status).toBe(201);
    assertMatchesSpec('clinical-api', '#/components/schemas/Biomarker', await recibida.json());
    expect(recibida.headers.get('set-cookie')).toBeNull();
    const enviada = clinicalApi.peticiones[0]!;
    expect(enviada.cabeceras['cookie']).toBe('oncolens_session=sesion-sintetica-1');
    expect(enviada.cabeceras['origin']).toBeUndefined();
    expect(JSON.parse(enviada.cuerpo)).toEqual(BIOMARCADOR);
  });

  it('retransmite el 201 del diagnóstico sin reserializar el cuerpo [US-111 AC-1]', async () => {
    clinicalApi.responder('post', RUTAS.diagnoses, 201, ejemplo('diagnosis-con-gradings.json'));

    const { respuesta } = registrar('createManualDiagnosis', VALIDAS, DIAGNOSTICO);
    const recibida = await respuesta;

    expect(recibida.status).toBe(201);
    assertMatchesSpec('clinical-api', '#/components/schemas/Diagnosis', await recibida.json());
    expect(JSON.parse(clinicalApi.peticiones[0]!.cuerpo)).toEqual(DIAGNOSTICO);
  });

  it.each([
    ['createManualDiagnosis', 'diagnoses', 'error-valor-fuera-de-catalogo-campo.json'],
    ['createManualDiagnosis', 'diagnoses', 'error-gradacion-incoherente-campo.json'],
    ['createManualBiomarker', 'biomarkers', 'error-valor-fuera-de-catalogo.json'],
  ] as const)(
    'retransmite el 422 de %s con su field (%s) [US-111 AC-4]',
    async (operacion, ruta, archivo) => {
      clinicalApi.responder('post', RUTAS[ruta], 422, ejemplo(archivo));

      const { respuesta } = registrar(
        operacion,
        VALIDAS,
        operacion === 'createManualBiomarker' ? BIOMARCADOR : DIAGNOSTICO,
      );
      const recibida = await respuesta;

      expect(recibida.status).toBe(422);
      expect(await recibida.json()).toEqual(ejemplo(archivo));
    },
  );

  it('responde 422 propio con el campo, sin llamar, cuando el cuerpo no cumple el contrato [US-111 AC-4]', async () => {
    const { respuesta } = registrar('createManualBiomarker', VALIDAS, { ...BIOMARCADOR, name: '' });

    const recibida = await respuesta;

    expect(recibida.status).toBe(422);
    expect(await recibida.json()).toMatchObject({ error: 'CUERPO_INVALIDO', field: 'name' });
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it.each(['createManualBiomarker', 'createManualDiagnosis'] as const)(
    'rechaza el Origin ajeno de %s con 403 sin llamar [US-111 AC-4]',
    async (operacion) => {
      const { respuesta } = registrar(
        operacion,
        { ...VALIDAS, Origin: 'https://evil.example' },
        operacion === 'createManualBiomarker' ? BIOMARCADOR : DIAGNOSTICO,
      );

      const recibida = await respuesta;

      expect(recibida.status).toBe(403);
      expect(await recibida.json()).toMatchObject({ error: 'PERMISO_DENEGADO' });
      expect(clinicalApi.peticiones).toHaveLength(0);
    },
  );

  it('sanea el 5xx de clinical-api sin su cuerpo ni su traceId [US-111 AC-4]', async () => {
    clinicalApi.responder(
      'post',
      RUTAS.biomarkers,
      500,
      { detalle: 'PrismaClientKnownRequestError en /srv/clinical-api' },
      { 'X-Trace-Id': 'req_interno' },
    );

    const { respuesta, lineas } = registrar('createManualBiomarker', VALIDAS, BIOMARCADOR);
    const recibida = await respuesta;

    expect(recibida.status).toBe(500);
    const texto = await recibida.text();
    expect(texto).not.toContain('Prisma');
    expect(JSON.parse(texto)).toMatchObject({ error: 'ERROR_INTERNO', traceId: 'req_web00001' });
    expect(JSON.stringify(lineas)).not.toContain('Prisma');
  });

  it('responde ERROR_INTERNO propio cuando clinical-api no contesta a tiempo [US-111 AC-4]', async () => {
    const { respuesta } = registrar('createManualDiagnosis', VALIDAS, DIAGNOSTICO, {
      fetch: () => Promise.reject(new DOMException('timeout', 'TimeoutError')),
    });

    const recibida = await respuesta;

    expect(recibida.status).toBe(500);
    expect(await recibida.json()).toMatchObject({ error: 'ERROR_INTERNO' });
  });

  it('responde 404 propio sin llamar cuando el id del paciente no es un UUID [US-111 AC-1]', async () => {
    const { respuesta } = registrar(
      'createManualBiomarker',
      VALIDAS,
      BIOMARCADOR,
      {},
      {
        id: 'no-es-uuid',
      },
    );

    const recibida = await respuesta;

    expect(recibida.status).toBe(404);
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it('no escribe el cuerpo ni el id del paciente en el log [US-111 AC-4] [RN-10]', async () => {
    clinicalApi.responder('post', RUTAS.biomarkers, 201, ejemplo('biomarker-corrected.json'));

    const { respuesta, lineas } = registrar('createManualBiomarker', VALIDAS, BIOMARCADOR);
    await respuesta;

    const registro = JSON.stringify(lineas);
    expect(registro).not.toContain(ID_PACIENTE);
    expect(registro).not.toContain(String(BIOMARCADOR['name']));
    expect(lineas.map((linea) => linea.event)).toEqual(['registro_manual.biomarcador.crear']);
  });

  it('retransmite las opciones con no-store sin exigir Origin [US-111 AC-1]', async () => {
    clinicalApi.responder('get', RUTAS.opciones, 200, ejemplo('manual-entry-options-mama.json'));
    const { dependencias, lineas } = crearDependenciasDeTest();

    const recibida = await crearManejadorDeRegistroManual(dependencias, 'getManualEntryOptions')(
      peticionDeLectura({ Cookie: COOKIE }),
      PARAMETROS_PACIENTE,
    );

    expect(recibida.status).toBe(200);
    const cuerpo = await recibida.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/ManualEntryOptions', cuerpo);
    expect(cuerpo).toEqual(ejemplo('manual-entry-options-mama.json'));
    expect(recibida.headers.get('cache-control')).toBe('no-store');
    expect(clinicalApi.peticiones[0]!.cabeceras['cookie']).toBe(
      'oncolens_session=sesion-sintetica-1',
    );
    expect(lineas.map((linea) => linea.event)).toEqual(['registro_manual.opciones.leer']);
  });
});
