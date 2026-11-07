import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sembrarPCaso } from '../../support/caso.js';
import { tipoDeCancerVigente } from '../../../src/modules/compartido/contexto-de-registro.js';
import { filaDeDiagnostico, generadorDeIds, insertar } from '../../support/filas-sinteticas.js';
import { contarAtributos, montarRegistroClinico } from '../../support/registro-clinico.js';
import {
  iniciarEscenarioDeRegistroManual,
  sembrarEgresado,
  sembrarMamaFM2,
  sembrarSinDiagnostico,
  type EscenarioDeRegistroManual,
} from '../../support/registro-manual.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9110;
const MENOPAUSIA = {
  attributeKey: 'estado_menopausico',
  value: 'posmenopausica',
  observedAt: '2026-09-01',
} as const;
const RUTA = (patientId: string): string => `/platform/patients/${patientId}/clinical-attributes`;

let escenario: EscenarioDeRegistroManual;
let mama: string;
let pCaso: string;
let pCasoPaciente: Awaited<ReturnType<typeof sembrarPCaso>>;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeRegistroManual('rc_atributos', ESPACIO_DE_IDS);
  mama = (await sembrarMamaFM2(escenario.siembra)).patientId;
  pCasoPaciente = await sembrarPCaso(escenario.siembra);
  pCaso = pCasoPaciente.patientId;
});
afterAll(() => escenario.cerrar());

function registrar(
  cuerpo: unknown,
  patientId: string = mama,
  cookie: string | null = escenario.cookieDoctor,
  opciones: Parameters<typeof montarRegistroClinico>[1] = {},
) {
  const { app } = montarRegistroClinico(escenario.mundo, opciones);
  const peticion = clienteVerificado(app).post(RUTA(patientId));
  return (cookie === null ? peticion : peticion.set('Cookie', cookie)).send(cuerpo as object);
}

function leer(patientId: string = pCaso, cookie: string | null = escenario.cookieDoctor) {
  const { app } = montarRegistroClinico(escenario.mundo);
  const peticion = clienteVerificado(app).get(RUTA(patientId));
  return cookie === null ? peticion : peticion.set('Cookie', cookie);
}

describe('registro manual de un atributo clínico', () => {
  it('registra estado_menopausico posmenopausica en mama y rechaza color_ojos con 422 cuando el doctor los envía [US-094 AC-3]', async () => {
    const antes = await contarAtributos(escenario.mundo.cliente, mama);

    const creado = await registrar(MENOPAUSIA);
    const rechazado = await registrar({ attributeKey: 'color_ojos', value: 'azules' });

    expect(creado.status).toBe(201);
    expect(creado.body).toMatchObject({
      key: 'estado_menopausico',
      value: 'posmenopausica',
      observedAt: '2026-09-01',
      datePrecision: 'dia',
      provenance: {
        entryMethod: 'manual',
        extractionConfidence: 'n_a',
        reviewStatus: 'verificado',
        conflict: false,
        sourceDocumentId: null,
      },
    });
    expect(rechazado.status).toBe(422);
    expect(rechazado.body).toMatchObject({
      error: 'VALOR_FUERA_DE_CATALOGO',
      field: 'attributeKey',
    });
    expect(JSON.stringify(rechazado.body)).not.toMatch(/color_ojos|azules/);
    expect(await contarAtributos(escenario.mundo.cliente, mama)).toBe(antes + 1);
  });

  it.each([
    ['attributeKey', { attributeKey: 'estado_castracion', value: 'castrado' }],
    ['value', { attributeKey: 'estado_menopausico', value: 'talvez' }],
  ])(
    'responde 422 VALOR_FUERA_DE_CATALOGO con field=%s y no crea filas sin repetir el valor enviado [US-094 AC-3] [RN-29]',
    async (campo, cuerpo) => {
      const antes = await contarAtributos(escenario.mundo.cliente, mama);

      const respuesta = await registrar(cuerpo);

      expect(respuesta.status).toBe(422);
      expect(respuesta.body).toMatchObject({ error: 'VALOR_FUERA_DE_CATALOGO', field: campo });
      expect(JSON.stringify(respuesta.body)).not.toContain('talvez');
      expect(await contarAtributos(escenario.mundo.cliente, mama)).toBe(antes);
    },
  );

  it('responde 422 TIPO_CANCER_NO_REGISTRADO sin field y no crea filas cuando el paciente no tiene diagnóstico vigente [US-094 AC-3]', async () => {
    const { patientId } = await sembrarSinDiagnostico(escenario.siembra);

    const respuesta = await registrar(MENOPAUSIA, patientId);

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('TIPO_CANCER_NO_REGISTRADO');
    expect(respuesta.body).not.toHaveProperty('field');
    expect(await contarAtributos(escenario.mundo.cliente, patientId)).toBe(0);
  });

  it('guarda observedAt nulo y precisión incierta cuando el atributo no trae fecha [US-094 AC-3]', async () => {
    const respuesta = await registrar(
      { attributeKey: 'estado_castracion', value: 'castrado' },
      pCaso,
    );

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ observedAt: null, datePrecision: 'incierta' });
  });

  it('registra una fila nueva y no corrige la anterior cuando se repite la clave [US-094 AC-3]', async () => {
    const antes = await contarAtributos(escenario.mundo.cliente, mama);

    const otra = await registrar({ ...MENOPAUSIA, value: 'perimenopausica' });

    expect(otra.status).toBe(201);
    expect(await contarAtributos(escenario.mundo.cliente, mama)).toBe(antes + 1);
    const { rows } = await escenario.mundo.cliente.query(
      "SELECT 1 FROM clinical.clinical_attribute WHERE patient_id = $1 AND review_status = 'reemplazado'",
      [mama],
    );
    expect(rows).toHaveLength(0);
  });
});

describe('tipo de cáncer vigente con dos diagnósticos activos', () => {
  it('resuelve el del diagnóstico más reciente tanto en el atributo como en la regla compartida con la corrección [US-094 AC-3] [L1D-309]', async () => {
    const { patientId, episodeId } = await sembrarMamaFM2(escenario.siembra);
    await insertar(
      escenario.mundo.cliente,
      'clinical.diagnosis',
      filaDeDiagnostico(generadorDeIds(9160), patientId, episodeId, {
        cancer_type: 'prostata',
        diagnosed_at: '2030-01-01',
      }),
    );

    const compartido = await tipoDeCancerVigente(escenario.mundo.cliente, patientId);
    const respuesta = await registrar(
      { attributeKey: 'estado_castracion', value: 'castrado' },
      patientId,
    );

    expect(compartido).toBe('prostata');
    expect(respuesta.status).toBe(201);
  });
});

describe('lectura de atributos clínicos', () => {
  it('no devuelve atributos reemplazados ni rechazados [US-094 AC-4] [RN-07]', async () => {
    const ids = generadorDeIds(9150);
    for (const [valor, estado] of [
      ['no_castrado', 'reemplazado'],
      ['resistente_castracion', 'rechazado'],
    ] as const) {
      await insertar(escenario.mundo.cliente, 'clinical.clinical_attribute', {
        id: ids(),
        patient_id: pCaso,
        episode_id: pCasoPaciente.episodeId,
        attribute_key: 'estado_castracion',
        value: valor,
        observed_at: '2026-06-01',
        date_precision: 'dia',
        entry_method: 'ocr',
        extraction_confidence: 'media',
        review_status: estado,
        created_at: '2026-10-01T12:00:00.000Z',
      });
    }

    const respuesta = await leer();

    expect(respuesta.status).toBe(200);
    const pares = (respuesta.body.items as { key: string; value: string }[]).map(
      (a) => `${a.key}=${a.value}`,
    );
    expect(pares).toContain('estado_castracion=castrado');
    expect(pares).toContain('sitios_metastasicos=oseo');
    expect(pares).not.toContain('estado_castracion=no_castrado');
    expect(pares).not.toContain('estado_castracion=resistente_castracion');
  });

  it('ordena por clave y fecha con los nulos al final [US-094 AC-4]', async () => {
    const respuesta = await leer();

    const claves = (respuesta.body.items as { key: string; observedAt: string | null }[]).map(
      (a) => [a.key, a.observedAt],
    );
    expect(claves).toEqual(
      [...claves].sort(([a, fa], [b, fb]) => {
        if (a !== b) return String(a) < String(b) ? -1 : 1;
        if (fa === fb) return 0;
        if (fa === null) return 1;
        if (fb === null) return -1;
        return String(fa) < String(fb) ? -1 : 1;
      }),
    );
  });

  it('trae los atributos permitidos del tipo de cáncer y la versión del catálogo montado [US-094 AC-6] [RN-29]', async () => {
    const respuesta = await leer();

    expect(respuesta.status).toBe(200);
    const permitidos = respuesta.body.allowedAttributes as {
      key: string;
      label: string;
      values: { value: string; label: string }[];
    }[];
    expect(permitidos.map((a) => a.key).sort()).toEqual([
      'estado_castracion',
      'sin_tratamiento_previo',
      'sitios_metastasicos',
    ]);
    expect(
      permitidos.find((a) => a.key === 'estado_castracion')?.values.map((v) => v.value),
    ).toContain('sensible_castracion');
    expect(respuesta.body.catalogVersion).toBe('1.8.0');
  });

  it('devuelve la lista vacía de permitidos cuando el paciente no tiene diagnóstico vigente [US-094 AC-6]', async () => {
    const { patientId } = await sembrarSinDiagnostico(escenario.siembra);

    const respuesta = await leer(patientId);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ items: [], allowedAttributes: [] });
  });
});

describe('validación y acceso de los atributos clínicos', () => {
  it('responde 422 CUERPO_INVALIDO con field=value y no crea filas cuando falta el valor [US-094 AC-5]', async () => {
    const antes = await contarAtributos(escenario.mundo.cliente, mama);

    const respuesta = await registrar({ attributeKey: 'estado_menopausico' });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({ error: 'CUERPO_INVALIDO', field: 'value' });
    expect(await contarAtributos(escenario.mundo.cliente, mama)).toBe(antes);
  });

  it('responde 404 en las dos operaciones cuando el paciente no existe [US-094 AC-5]', async () => {
    const inexistente = '00000000-0000-4000-8000-00000000dead';

    const escritura = await registrar(MENOPAUSIA, inexistente);
    const lectura = await leer(inexistente);

    expect(escritura.status).toBe(404);
    expect(lectura.status).toBe(404);
    expect(lectura.body.error).toBe('NO_ENCONTRADO');
  });

  it('responde 401 en las dos operaciones y no crea filas cuando no hay sesión [US-094 AC-5]', async () => {
    const antes = await contarAtributos(escenario.mundo.cliente, mama);

    const escritura = await registrar(MENOPAUSIA, mama, null);
    const lectura = await leer(mama, null);

    expect(escritura.status).toBe(401);
    expect(lectura.status).toBe(401);
    expect(await contarAtributos(escenario.mundo.cliente, mama)).toBe(antes);
  });

  it('responde 403 al admin en las dos operaciones sin crear filas ni devolver datos clínicos [US-094 AC-5] [PRD v1.4 §11]', async () => {
    const antes = await contarAtributos(escenario.mundo.cliente, mama);

    const escritura = await registrar(MENOPAUSIA, mama, escenario.cookieAdmin);
    const lectura = await leer(mama, escenario.cookieAdmin);

    expect(escritura.status).toBe(403);
    expect(lectura.status).toBe(403);
    expect(lectura.body).not.toHaveProperty('items');
    expect(await contarAtributos(escenario.mundo.cliente, mama)).toBe(antes);
  });

  it('responde 422 PACIENTE_EGRESADO sin field al registrar y 200 al leer cuando el paciente está egresado [US-094 AC-5] [RN-17]', async () => {
    const { patientId } = await sembrarEgresado(escenario.siembra);

    const escritura = await registrar(
      { attributeKey: 'estado_castracion', value: 'castrado' },
      patientId,
    );
    const lectura = await leer(patientId);

    expect(escritura.status).toBe(422);
    expect(escritura.body.error).toBe('PACIENTE_EGRESADO');
    expect(escritura.body).not.toHaveProperty('field');
    expect(await contarAtributos(escenario.mundo.cliente, patientId)).toBe(0);
    expect(lectura.status).toBe(200);
  });

  it('responde 500 sin detalle del driver ni del valor registrado cuando la base de datos no responde [US-094 AC-5]', async () => {
    let intentos = 0;
    const fuenteCaida = {
      connect: () => {
        intentos += 1;
        return Promise.reject(
          new Error('FATAL: password authentication failed; value posmenopausica'),
        );
      },
    };

    const respuesta = await registrar(MENOPAUSIA, mama, escenario.cookieDoctor, {
      fuente: fuenteCaida,
    });

    expect(intentos).toBe(1);
    expect(respuesta.status).toBe(500);
    expect(respuesta.body).toMatchObject({ error: 'ERROR_INTERNO' });
    expect(JSON.stringify(respuesta.body)).not.toMatch(/FATAL|posmenopausica/);
  });
});
