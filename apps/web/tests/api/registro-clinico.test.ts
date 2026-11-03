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
  ID_PACIENTE,
  PARAMETROS_PACIENTE,
  peticionDeCorreccion,
  peticionDeLectura,
} from '../support/correcciones-simulado';
import { URL_CLINICAL_API } from '../support/clinical-api-simulado';

const clinicalApi = crearCorreccionesSimuladas();
const COOKIE = 'otra=x; oncolens_session=sesion-sintetica-1';
const VALIDAS = { Origin: ORIGEN_PERMITIDO, Cookie: COOKIE };
const BASE = `${URL_CLINICAL_API}/platform/patients/${ID_PACIENTE}`;
const RUTAS = {
  tratamiento: `${BASE}/prior-treatments`,
  atributos: `${BASE}/clinical-attributes`,
} as const;

beforeAll(() => clinicalApi.iniciar());
afterEach(() => clinicalApi.reiniciar());
afterAll(() => clinicalApi.detener());

function crearTratamiento(cabeceras: Record<string, string>, cuerpo: unknown) {
  const { dependencias, lineas } = crearDependenciasDeTest();
  const manejador = crearManejadorDeRegistroManual(dependencias, 'createManualPriorTreatment');
  return {
    lineas,
    respuesta: manejador(
      peticionDeCorreccion(cabeceras, cuerpo, 'prior-treatments'),
      PARAMETROS_PACIENTE,
    ),
  };
}

function crearAtributo(cabeceras: Record<string, string>, cuerpo: unknown) {
  const { dependencias, lineas } = crearDependenciasDeTest();
  const manejador = crearManejadorDeRegistroManual(dependencias, 'createManualClinicalAttribute');
  return {
    lineas,
    respuesta: manejador(
      peticionDeCorreccion(cabeceras, cuerpo, 'clinical-attributes'),
      PARAMETROS_PACIENTE,
    ),
  };
}

describe('Route Handlers del tratamiento previo manual', () => {
  it('reenvía solo la cookie de sesión y retransmite el 201 sin reserializar [US-094 AC-1]', async () => {
    clinicalApi.responder(
      'post',
      RUTAS.tratamiento,
      201,
      ejemplo('prior-treatment-manual-creado.json'),
      { 'Set-Cookie': 'interna=1' },
    );

    const { respuesta } = crearTratamiento(VALIDAS, ejemplo('prior-treatment-manual.json'));
    const recibida = await respuesta;

    expect(recibida.status).toBe(201);
    const cuerpo = await recibida.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/PriorTreatment', cuerpo);
    expect(cuerpo).toEqual(ejemplo('prior-treatment-manual-creado.json'));
    expect(recibida.headers.get('set-cookie')).toBeNull();
    const enviada = clinicalApi.peticiones[0]!;
    expect(enviada.cabeceras['cookie']).toBe('oncolens_session=sesion-sintetica-1');
    expect(enviada.cabeceras['origin']).toBeUndefined();
    expect(JSON.parse(enviada.cuerpo)).toEqual(ejemplo('prior-treatment-manual.json'));
  });

  it('retransmite el esquema no mapeado del 201 sin código inventado [US-094 AC-2]', async () => {
    clinicalApi.responder('post', RUTAS.tratamiento, 201, ejemplo('prior-treatment-no-mapeado.json'));

    const { respuesta } = crearTratamiento(VALIDAS, {
      setting: 'otro',
      regimenName: 'Fármaco experimental X',
      ongoing: false,
      endReason: 'desconocido',
    });
    const recibida = await respuesta;

    expect(recibida.status).toBe(201);
    expect(await recibida.json()).toMatchObject({ mappingStatus: 'no_mapeado', atcCodes: [] });
  });

  it('responde 403 sin llamar a clinical-api cuando el Origin es ajeno [US-094 AC-5]', async () => {
    const { respuesta } = crearTratamiento(
      { ...VALIDAS, Origin: 'https://evil.example' },
      ejemplo('prior-treatment-manual.json'),
    );

    const recibida = await respuesta;

    expect(recibida.status).toBe(403);
    expect(await recibida.json()).toMatchObject({ error: 'PERMISO_DENEGADO' });
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it('responde 422 propio con el campo, sin llamar, cuando falta el esquema [US-094 AC-5]', async () => {
    const { respuesta } = crearTratamiento(VALIDAS, { setting: 'otro', ongoing: true });

    const recibida = await respuesta;

    expect(recibida.status).toBe(422);
    expect(await recibida.json()).toMatchObject({ error: 'CUERPO_INVALIDO', field: 'regimenName' });
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it.each([
    [403, 'error-permiso-denegado.json'],
    [422, 'error-paciente-egresado.json'],
  ])('retransmite el %i de clinical-api tal cual (%s) [US-094 AC-5]', async (status, archivo) => {
    clinicalApi.responder('post', RUTAS.tratamiento, status, ejemplo(archivo));

    const { respuesta } = crearTratamiento(VALIDAS, ejemplo('prior-treatment-manual.json'));
    const recibida = await respuesta;

    expect(recibida.status).toBe(status);
    expect(await recibida.json()).toEqual(ejemplo(archivo));
  });

  it('no escribe el esquema registrado en el log [US-094 AC-1] [RN-10]', async () => {
    clinicalApi.responder('post', RUTAS.tratamiento, 201, ejemplo('prior-treatment-manual-creado.json'));

    const { respuesta, lineas } = crearTratamiento(VALIDAS, ejemplo('prior-treatment-manual.json'));
    await respuesta;

    expect(JSON.stringify(lineas)).not.toContain('Leuprorelina');
    expect(lineas.map((linea) => linea.event)).toEqual(['registro_clinico.tratamiento.crear']);
  });
});

describe('Route Handlers del atributo clínico', () => {
  it('retransmite el 201 del atributo y valida contra el spec [US-094 AC-3]', async () => {
    clinicalApi.responder('post', RUTAS.atributos, 201, ejemplo('clinical-attribute-creado.json'));

    const { respuesta } = crearAtributo(VALIDAS, ejemplo('clinical-attribute-manual.json'));
    const recibida = await respuesta;

    expect(recibida.status).toBe(201);
    const cuerpo = await recibida.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/ClinicalAttribute', cuerpo);
    expect(JSON.parse(clinicalApi.peticiones[0]!.cuerpo)).toEqual(
      ejemplo('clinical-attribute-manual.json'),
    );
  });

  it('retransmite el 422 con el campo que indica clinical-api [US-094 AC-6]', async () => {
    clinicalApi.responder('post', RUTAS.atributos, 422, ejemplo('error-registro-clinico-campo.json'));

    const { respuesta } = crearAtributo(VALIDAS, ejemplo('clinical-attribute-manual.json'));
    const recibida = await respuesta;

    expect(recibida.status).toBe(422);
    expect(await recibida.json()).toEqual(ejemplo('error-registro-clinico-campo.json'));
  });

  it('responde 403 sin llamar cuando el Origin es ajeno [US-094 AC-5]', async () => {
    const { respuesta } = crearAtributo(
      { ...VALIDAS, Origin: 'https://evil.example' },
      ejemplo('clinical-attribute-manual.json'),
    );

    const recibida = await respuesta;

    expect(recibida.status).toBe(403);
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it('responde 422 propio con el campo, sin llamar, cuando falta el valor [US-094 AC-5]', async () => {
    const { respuesta } = crearAtributo(VALIDAS, { attributeKey: 'estado_menopausico' });

    const recibida = await respuesta;

    expect(recibida.status).toBe(422);
    expect(await recibida.json()).toMatchObject({ error: 'CUERPO_INVALIDO', field: 'value' });
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it('retransmite la lectura con los permitidos sin exigir Origin [US-094 AC-6]', async () => {
    clinicalApi.responder('get', RUTAS.atributos, 200, ejemplo('clinical-attributes-list.json'));
    const { dependencias } = crearDependenciasDeTest();

    const recibida = await crearManejadorDeRegistroManual(dependencias, 'listClinicalAttributes')(
      peticionDeLectura({ Cookie: COOKIE }),
      PARAMETROS_PACIENTE,
    );

    expect(recibida.status).toBe(200);
    const cuerpo = await recibida.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/ClinicalAttributeList', cuerpo);
    expect(cuerpo).toEqual(ejemplo('clinical-attributes-list.json'));
    expect(recibida.headers.get('cache-control')).toBe('no-store');
    expect(clinicalApi.peticiones[0]!.cabeceras['cookie']).toBe('oncolens_session=sesion-sintetica-1');
  });
});
