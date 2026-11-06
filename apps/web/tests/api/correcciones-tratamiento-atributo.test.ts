import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../scripts/contracts/lib/responseValidator.mjs';
import {
  crearManejadorDeRegistroManual,
  type OperacionDeRegistroManual,
  type ParametrosDeRuta,
} from '../../lib/server/registro-manual';
import {
  crearDependenciasDeTest,
  ejemplo,
  ORIGEN_PERMITIDO,
} from '../support/clinical-api-simulado';
import {
  crearCorreccionesSimuladas,
  PARAMETROS_ATRIBUTO,
  PARAMETROS_TRATAMIENTO,
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

interface Caso {
  readonly nombre: string;
  readonly operacion: OperacionDeRegistroManual;
  readonly parametros: ParametrosDeRuta;
  readonly ruta: string;
  readonly cuerpo: string;
  readonly respuesta: string;
  readonly esquema: string;
  readonly evento: string;
  readonly errores: readonly (readonly [number, string])[];
}

const CASOS: readonly Caso[] = [
  {
    nombre: 'tratamiento previo',
    operacion: 'correctPriorTreatment',
    parametros: PARAMETROS_TRATAMIENTO,
    ruta: RUTAS.correccionTratamiento,
    cuerpo: 'prior-treatment-correction-request.json',
    respuesta: 'prior-treatment-corregido.json',
    esquema: 'PriorTreatment',
    evento: 'correcciones.tratamiento.corregir',
    errores: [
      [422, 'error-correccion-fecha-fin.json'],
      [409, 'error-dato-no-vigente.json'],
      [403, 'error-permiso-denegado.json'],
      [422, 'error-paciente-egresado.json'],
    ],
  },
  {
    nombre: 'atributo clínico',
    operacion: 'correctClinicalAttribute',
    parametros: PARAMETROS_ATRIBUTO,
    ruta: RUTAS.correccionAtributo,
    cuerpo: 'clinical-attribute-correction-request.json',
    respuesta: 'clinical-attribute-corregido.json',
    esquema: 'ClinicalAttribute',
    evento: 'correcciones.atributo.corregir',
    errores: [
      [422, 'error-valor-fuera-de-catalogo-campo.json'],
      [409, 'error-dato-no-vigente.json'],
      [403, 'error-permiso-denegado.json'],
      [422, 'error-paciente-egresado.json'],
    ],
  },
];

function corregir(caso: Caso, cabeceras: Record<string, string>, cuerpo: unknown) {
  const { dependencias, lineas } = crearDependenciasDeTest();
  const manejador = crearManejadorDeRegistroManual(dependencias, caso.operacion);
  return { lineas, respuesta: manejador(peticionDeCorreccion(cabeceras, cuerpo), caso.parametros) };
}

describe.each(CASOS)('Route Handler de corrección de $nombre', (caso) => {
  it('responde 403 sin llamar a clinical-api cuando el Origin es ajeno [d5fb-05 AC-11]', async () => {
    const { respuesta, lineas } = corregir(
      caso,
      { ...VALIDAS, Origin: 'https://evil.example' },
      ejemplo(caso.cuerpo),
    );

    const recibida = await respuesta;

    expect(recibida.status).toBe(403);
    expect(await recibida.json()).toMatchObject({
      error: 'PERMISO_DENEGADO',
      traceId: 'req_web00001',
    });
    expect(clinicalApi.peticiones).toHaveLength(0);
    expect(lineas).toEqual([
      { event: caso.evento, status: 403, traceId: 'req_web00001', motivo: 'origen' },
    ]);
  });

  it('reenvía solo la cookie de sesión y retransmite el 201 sin reserializar [d5fb-05 AC-11]', async () => {
    clinicalApi.responder('post', caso.ruta, 201, ejemplo(caso.respuesta), {
      'Set-Cookie': 'interna=1',
    });

    const { respuesta } = corregir(
      caso,
      { ...VALIDAS, 'X-Trace-Id': 'trace-del-navegador' },
      ejemplo(caso.cuerpo),
    );
    const recibida = await respuesta;

    expect(recibida.status).toBe(201);
    const cuerpo = await recibida.json();
    assertMatchesSpec('clinical-api', `#/components/schemas/${caso.esquema}`, cuerpo);
    expect(cuerpo).toEqual(ejemplo(caso.respuesta));
    expect(recibida.headers.get('set-cookie')).toBeNull();
    const enviada = clinicalApi.peticiones[0]!;
    expect(enviada.cabeceras['cookie']).toBe('oncolens_session=sesion-sintetica-1');
    expect(enviada.cabeceras['origin']).toBeUndefined();
    expect(JSON.stringify(enviada.cabeceras)).not.toContain('trace-del-navegador');
    expect(JSON.parse(enviada.cuerpo)).toEqual(ejemplo(caso.cuerpo));
  });

  it.each(caso.errores)(
    'retransmite el %i de clinical-api tal cual (%s) [d5fb-05 AC-11]',
    async (status, ejemploError) => {
      clinicalApi.responder('post', caso.ruta, status, ejemplo(ejemploError));

      const { respuesta } = corregir(caso, VALIDAS, ejemplo(caso.cuerpo));
      const recibida = await respuesta;

      expect(recibida.status).toBe(status);
      expect(await recibida.json()).toEqual(ejemplo(ejemploError));
    },
  );

  it('responde 404 propio sin llamar cuando un id no es UUID [d5fb-05 AC-11]', async () => {
    const { dependencias } = crearDependenciasDeTest();
    const manejador = crearManejadorDeRegistroManual(dependencias, caso.operacion);

    const recibida = await manejador(peticionDeCorreccion(VALIDAS, ejemplo(caso.cuerpo)), {
      id: caso.parametros.id,
      treatmentId: 'no-es-uuid',
      attributeId: 'no-es-uuid',
    });

    expect(recibida.status).toBe(404);
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it('sanea el 5xx sin cuerpo de clinical-api ni su traceId [d5fb-05 AC-11]', async () => {
    clinicalApi.responder(
      'post',
      caso.ruta,
      500,
      { detalle: 'PrismaClientKnownRequestError en /srv/clinical-api' },
      { 'X-Trace-Id': 'req_interno' },
    );

    const { respuesta, lineas } = corregir(caso, VALIDAS, ejemplo(caso.cuerpo));
    const recibida = await respuesta;

    expect(recibida.status).toBe(500);
    const texto = await recibida.text();
    expect(texto).not.toContain('Prisma');
    expect(JSON.parse(texto)).toMatchObject({ error: 'ERROR_INTERNO', traceId: 'req_web00001' });
    expect(JSON.stringify(lineas)).not.toContain('Prisma');
  });

  it('no escribe el esquema ni el valor corregido en el log [d5fb-05 AC-11] [RN-10]', async () => {
    clinicalApi.responder('post', caso.ruta, 201, ejemplo(caso.respuesta));

    const { respuesta, lineas } = corregir(caso, VALIDAS, ejemplo(caso.cuerpo));
    await respuesta;

    expect(JSON.stringify(lineas)).not.toMatch(/FEC|premenopausica/);
  });
});

describe('Route Handler de corrección de tratamiento: validación propia', () => {
  it('responde 422 propio con el campo, sin llamar, cuando el cuerpo no cumple el contrato [d5fb-05 AC-11]', async () => {
    const { respuesta } = corregir(CASOS[0]!, VALIDAS, { setting: 'adyuvante', ongoing: false });

    const recibida = await respuesta;

    expect(recibida.status).toBe(422);
    expect(await recibida.json()).toEqual({
      error: 'CUERPO_INVALIDO',
      field: 'regimenName',
      message: 'La solicitud no cumple el contrato.',
      traceId: 'req_web00001',
    });
    expect(clinicalApi.peticiones).toHaveLength(0);
  });
});

describe('Route Handler de corrección de atributo: validación propia', () => {
  it('responde 422 propio, sin llamar, cuando el cuerpo trae la clave del atributo [d5fb-05 AC-11]', async () => {
    const { respuesta } = corregir(CASOS[1]!, VALIDAS, {
      value: 'premenopausica',
      attributeKey: 'estado_castracion',
    });

    const recibida = await respuesta;

    expect(recibida.status).toBe(422);
    expect(await recibida.json()).toMatchObject({ error: 'CUERPO_INVALIDO' });
    expect(clinicalApi.peticiones).toHaveLength(0);
  });
});

describe.each([
  {
    operacion: 'getPriorTreatmentHistory',
    parametros: PARAMETROS_TRATAMIENTO,
    ruta: RUTAS.historicoTratamiento,
    archivo: 'correction-history-prior-treatment.json',
    evento: 'correcciones.tratamiento.historico',
  },
  {
    operacion: 'getClinicalAttributeHistory',
    parametros: PARAMETROS_ATRIBUTO,
    ruta: RUTAS.historicoAtributo,
    archivo: 'correction-history-clinical-attribute.json',
    evento: 'correcciones.atributo.historico',
  },
] as const)('Route Handler del histórico $operacion', (caso) => {
  it('retransmite la lectura sin exigir Origin y sin caché [d5fb-05 AC-11]', async () => {
    clinicalApi.responder('get', caso.ruta, 200, ejemplo(caso.archivo));
    const { dependencias, lineas } = crearDependenciasDeTest();

    const recibida = await crearManejadorDeRegistroManual(dependencias, caso.operacion)(
      peticionDeLectura({ Cookie: COOKIE }),
      caso.parametros,
    );

    expect(recibida.status).toBe(200);
    const cuerpo = await recibida.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/CorrectionHistory', cuerpo);
    expect(cuerpo).toEqual(ejemplo(caso.archivo));
    expect(recibida.headers.get('cache-control')).toBe('no-store');
    expect(clinicalApi.peticiones[0]!.cabeceras['cookie']).toBe(
      'oncolens_session=sesion-sintetica-1',
    );
    expect(lineas.map((linea) => linea.event)).toEqual([caso.evento]);
  });

  it('responde 404 propio sin llamar cuando el id no es UUID [d5fb-05 AC-11]', async () => {
    const { dependencias } = crearDependenciasDeTest();

    const recibida = await crearManejadorDeRegistroManual(dependencias, caso.operacion)(
      peticionDeLectura({ Cookie: COOKIE }),
      {
        id: caso.parametros.id,
        treatmentId: 'no-es-uuid',
        attributeId: 'no-es-uuid',
      },
    );

    expect(recibida.status).toBe(404);
    expect(clinicalApi.peticiones).toHaveLength(0);
  });
});
