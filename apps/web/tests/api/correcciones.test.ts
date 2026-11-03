import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../scripts/contracts/lib/responseValidator.mjs';
import { crearManejadorDeRegistroManual } from '../../lib/server/registro-manual';
import {
  crearDependenciasDeTest,
  ejemplo,
  ORIGEN_PERMITIDO,
} from '../support/clinical-api-simulado';
import {
  crearCorreccionesSimuladas,
  PARAMETROS_BIOMARCADOR,
  PARAMETROS_NOTA,
  PARAMETROS_PACIENTE,
  peticionDeCorreccion,
  peticionDeLectura,
  RUTAS,
} from '../support/correcciones-simulado';

const clinicalApi = crearCorreccionesSimuladas();
const COOKIE = 'otra=x; oncolens_session=sesion-sintetica-1';
const VALIDAS = { Origin: ORIGEN_PERMITIDO, Cookie: COOKIE };

beforeAll(() => clinicalApi.iniciar());
afterEach(() => clinicalApi.reiniciar());
afterAll(() => clinicalApi.detener());

function corregirBiomarcador(cabeceras: Record<string, string>, cuerpo: unknown) {
  const { dependencias, lineas } = crearDependenciasDeTest();
  const manejador = crearManejadorDeRegistroManual(dependencias, 'correctBiomarker');
  return {
    lineas,
    respuesta: manejador(peticionDeCorreccion(cabeceras, cuerpo), PARAMETROS_BIOMARCADOR),
  };
}

describe('Route Handlers de corrección con histórico', () => {
  it('responde 403 sin llamar a clinical-api cuando el Origin es ajeno [US-253 AC-1]', async () => {
    const { respuesta, lineas } = corregirBiomarcador(
      { ...VALIDAS, Origin: 'https://evil.example' },
      ejemplo('biomarker-correction-request.json'),
    );

    const recibida = await respuesta;

    expect(recibida.status).toBe(403);
    expect(await recibida.json()).toMatchObject({
      error: 'PERMISO_DENEGADO',
      traceId: 'req_web00001',
    });
    expect(clinicalApi.peticiones).toHaveLength(0);
    expect(lineas).toEqual([
      { event: 'correcciones.proxy', status: 403, traceId: 'req_web00001', motivo: 'origen' },
    ]);
  });

  it('reenvía solo la cookie de sesión y retransmite el 201 sin reserializar [US-253 AC-1]', async () => {
    clinicalApi.responder(
      'post',
      RUTAS.correccionBiomarcador,
      201,
      ejemplo('biomarker-corrected.json'),
      { 'Set-Cookie': 'interna=1' },
    );

    const { respuesta } = corregirBiomarcador(
      { ...VALIDAS, 'X-Trace-Id': 'trace-del-navegador' },
      ejemplo('biomarker-correction-request.json'),
    );
    const recibida = await respuesta;

    expect(recibida.status).toBe(201);
    const cuerpo = await recibida.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/Biomarker', cuerpo);
    expect(cuerpo).toEqual(ejemplo('biomarker-corrected.json'));
    expect(recibida.headers.get('set-cookie')).toBeNull();
    const enviada = clinicalApi.peticiones[0]!;
    expect(enviada.cabeceras['cookie']).toBe('oncolens_session=sesion-sintetica-1');
    expect(enviada.cabeceras['origin']).toBeUndefined();
    expect(JSON.stringify(enviada.cabeceras)).not.toContain('trace-del-navegador');
    expect(JSON.parse(enviada.cuerpo)).toEqual(ejemplo('biomarker-correction-request.json'));
  });

  it.each([
    [422, 'error-correccion-fecha-futura.json', 'US-253 AC-3'],
    [409, 'error-dato-no-vigente.json', 'US-253 AC-3'],
    [403, 'error-permiso-denegado.json', 'US-253 AC-4'],
    [422, 'error-paciente-egresado.json', 'US-253 AC-4'],
  ])('retransmite el %i de clinical-api tal cual (%s) [%s]', async (status, ejemploError) => {
    clinicalApi.responder('post', RUTAS.correccionBiomarcador, status, ejemplo(ejemploError));

    const { respuesta } = corregirBiomarcador(
      VALIDAS,
      ejemplo('biomarker-correction-request.json'),
    );
    const recibida = await respuesta;

    expect(recibida.status).toBe(status);
    expect(await recibida.json()).toEqual(ejemplo(ejemploError));
  });

  it('responde 422 propio con el campo, sin llamar, cuando el cuerpo no cumple el contrato [US-253 AC-3]', async () => {
    const { respuesta } = corregirBiomarcador(VALIDAS, { value: '' });

    const recibida = await respuesta;

    expect(recibida.status).toBe(422);
    expect(await recibida.json()).toEqual({
      error: 'CUERPO_INVALIDO',
      field: 'value',
      message: 'La solicitud no cumple el contrato.',
      traceId: 'req_web00001',
    });
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it('responde 404 propio sin llamar cuando un id no es UUID [US-253 AC-1]', async () => {
    const { dependencias } = crearDependenciasDeTest();
    const manejador = crearManejadorDeRegistroManual(dependencias, 'correctBiomarker');

    const recibida = await manejador(
      peticionDeCorreccion(VALIDAS, ejemplo('biomarker-correction-request.json')),
      { id: PARAMETROS_BIOMARCADOR.id, biomarkerId: 'no-es-uuid' },
    );

    expect(recibida.status).toBe(404);
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it('sanea el 5xx sin cuerpo de clinical-api ni su traceId [US-253 AC-1]', async () => {
    clinicalApi.responder(
      'post',
      RUTAS.correccionBiomarcador,
      500,
      { detalle: 'PrismaClientKnownRequestError en /srv/clinical-api' },
      { 'X-Trace-Id': 'req_interno' },
    );

    const { respuesta, lineas } = corregirBiomarcador(
      VALIDAS,
      ejemplo('biomarker-correction-request.json'),
    );
    const recibida = await respuesta;

    expect(recibida.status).toBe(500);
    const texto = await recibida.text();
    expect(texto).not.toContain('Prisma');
    expect(JSON.parse(texto)).toMatchObject({ error: 'ERROR_INTERNO', traceId: 'req_web00001' });
    expect(JSON.stringify(lineas)).not.toContain('Prisma');
  });

  it('corrige una nota sin escribir su texto en el log [US-253 AC-6]', async () => {
    clinicalApi.responder(
      'post',
      RUTAS.correccionNota,
      201,
      ejemplo('clinical-note-corrected.json'),
    );
    const { dependencias, lineas } = crearDependenciasDeTest();
    const cuerpo = ejemplo('clinical-note-correction-request.json');

    const recibida = await crearManejadorDeRegistroManual(dependencias, 'correctClinicalNote')(
      peticionDeCorreccion(VALIDAS, cuerpo, 'clinical-notes'),
      PARAMETROS_NOTA,
    );

    expect(recibida.status).toBe(201);
    assertMatchesSpec('clinical-api', '#/components/schemas/ClinicalNote', await recibida.json());
    expect(JSON.parse(clinicalApi.peticiones[0]!.cuerpo)).toEqual(cuerpo);
    expect(JSON.stringify(lineas)).not.toContain('Hipertensión');
  });

  it.each([
    [
      'getBiomarkerHistory',
      RUTAS.historicoBiomarcador,
      PARAMETROS_BIOMARCADOR,
      'correction-history-biomarker.json',
      'CorrectionHistory',
    ],
    [
      'getClinicalNoteHistory',
      RUTAS.historicoNota,
      PARAMETROS_NOTA,
      'correction-history-clinical-note.json',
      'CorrectionHistory',
    ],
    [
      'listClinicalNotes',
      RUTAS.notas,
      PARAMETROS_PACIENTE,
      'clinical-notes-list.json',
      'ClinicalNoteList',
    ],
  ] as const)(
    'retransmite la lectura %s sin exigir Origin [US-253 AC-1]',
    async (operacion, ruta, parametros, archivo, esquema) => {
      clinicalApi.responder('get', ruta, 200, ejemplo(archivo));
      const { dependencias } = crearDependenciasDeTest();

      const recibida = await crearManejadorDeRegistroManual(dependencias, operacion)(
        peticionDeLectura({ Cookie: COOKIE }),
        parametros,
      );

      expect(recibida.status).toBe(200);
      const cuerpo = await recibida.json();
      assertMatchesSpec('clinical-api', `#/components/schemas/${esquema}`, cuerpo);
      expect(cuerpo).toEqual(ejemplo(archivo));
      expect(recibida.headers.get('cache-control')).toBe('no-store');
      expect(clinicalApi.peticiones[0]!.cabeceras['cookie']).toBe(
        'oncolens_session=sesion-sintetica-1',
      );
    },
  );
});
