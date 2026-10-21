import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolverOperacion } from '../lib/operations.mjs';
import { crearVerificadorDeRespuestas, verificarRespuesta } from '../lib/responseValidator.mjs';
import { ROOT } from './helpers/parches.mjs';

const ejemplo = (nombre) => JSON.parse(readFileSync(path.join(ROOT, 'contracts/examples', nombre), 'utf8'));
const VALOR_SENTINELA = 'VALOR-SINTETICO-QUE-NO-DEBE-IMPRIMIRSE';

const respuestaDeAnalisis = (sobrescribir = {}) => ({
  proveedor: 'clinical-api',
  metodo: 'post',
  ruta: '/platform/evidence-analyses',
  status: 200,
  cabeceras: { 'content-type': 'application/json' },
  cuerpo: ejemplo('con-evidencia-s1.json'),
  ...sobrescribir,
});

const mensajeDe = (respuesta) => {
  try {
    verificarRespuesta(respuesta);
  } catch (error) {
    return error.message;
  }
  return undefined;
};

describe('verificarRespuesta', () => {
  it('devuelve plantilla y código cuando la respuesta cumple el spec [US-214 AC-1]', () => {
    expect(verificarRespuesta(respuestaDeAnalisis())).toEqual({ plantilla: '/platform/evidence-analyses', codigo: '200' });
  });

  it('acepta una respuesta de error con el schema que declara su operación [US-214 AC-3]', () => {
    const respuesta = respuestaDeAnalisis({ status: 401, cuerpo: ejemplo('error-no-autenticado.json') });
    expect(verificarRespuesta(respuesta)).toEqual({ plantilla: '/platform/evidence-analyses', codigo: '401' });
  });

  it('acepta una respuesta sin cuerpo cuando la operación no declara contenido', () => {
    const respuesta = { proveedor: 'clinical-api', metodo: 'post', ruta: '/platform/auth/login', status: 204, cabeceras: {}, cuerpo: undefined };
    expect(verificarRespuesta(respuesta)).toEqual({ plantilla: '/platform/auth/login', codigo: '204' });
  });

  it('nombra proveedor, método, plantilla, código y campo, sin el valor, cuando el cuerpo trae un campo no declarado [US-214 AC-2]', () => {
    const mensaje = mensajeDe(respuestaDeAnalisis({ cuerpo: { ...ejemplo('con-evidencia-s1.json'), campoNoDeclarado: VALOR_SENTINELA } }));
    expect(mensaje).toMatch(/^la respuesta no cumple clinical-api POST \/platform\/evidence-analyses 200: .*\/campoNoDeclarado/m);
    expect(mensaje).not.toContain(VALOR_SENTINELA);
  });

  it('nombra la ruta JSON anidada sin el valor cuando un campo requerido falta [US-214 AC-2]', () => {
    const { status, ...sinStatus } = ejemplo('con-evidencia-s1.json');
    expect(status).toBeDefined();
    const mensaje = mensajeDe(respuestaDeAnalisis({ cuerpo: sinStatus }));
    expect(mensaje).toMatch(/200: \/status/);
  });

  it('nombra /error y no imprime el valor cuando un 422 trae un code que su operación no declara [US-214 AC-3]', () => {
    const cuerpo = { ...ejemplo('error-cuerpo-invalido.json'), error: VALOR_SENTINELA };
    const mensaje = mensajeDe(respuestaDeAnalisis({ status: 422, cuerpo }));
    expect(mensaje).toMatch(/clinical-api POST \/platform\/evidence-analyses 422: \/error/);
    expect(mensaje).not.toContain(VALOR_SENTINELA);
  });

  it('falla nombrando el código y los declarados cuando la operación no declara ese status [US-214 AC-1]', () => {
    const mensaje = mensajeDe(respuestaDeAnalisis({ status: 418 }));
    expect(mensaje).toContain('clinical-api POST /platform/evidence-analyses 418: código no declarado');
    expect(mensaje).toContain('200');
  });

  it('falla cuando la operación declara cuerpo y la respuesta no lo trae [US-214 AC-3]', () => {
    expect(mensajeDe(respuestaDeAnalisis({ cuerpo: undefined }))).toMatch(/200: #: falta el cuerpo/);
  });

  it('falla cuando la operación no declara cuerpo y la respuesta lo trae [US-214 AC-1]', () => {
    const respuesta = { proveedor: 'clinical-api', metodo: 'post', ruta: '/platform/auth/login', status: 204, cabeceras: {}, cuerpo: { nota: VALOR_SENTINELA } };
    const mensaje = mensajeDe(respuesta);
    expect(mensaje).toMatch(/204: #: la respuesta no declara cuerpo/);
    expect(mensaje).not.toContain(VALOR_SENTINELA);
  });

  it('falla cerrado sin imprimir identificadores cuando la operación no existe en el spec', () => {
    const idSintetico = '00000000-0000-4000-8000-000000000001';
    const mensaje = mensajeDe(respuestaDeAnalisis({ ruta: `/platform/no-existe/${idSintetico}?q=x`, metodo: 'get' }));
    expect(mensaje).toBe('clinical-api GET /platform/no-existe/{id}: la operación no existe en el spec');
  });

  it('falla cerrado cuando el proveedor no tiene spec', () => {
    expect(mensajeDe(respuestaDeAnalisis({ proveedor: 'otro-servicio' }))).toMatch(/proveedor sin spec empaquetado: otro-servicio/);
  });

  it('verifica rag-orchestrator con su propio spec y rechaza sin_evidencia con topRelevanceScore 0.0 [US-214 AC-2]', () => {
    const respuesta = (cuerpo) => ({ proveedor: 'rag-orchestrator', metodo: 'post', ruta: '/rag/query', status: 200, cabeceras: {}, cuerpo });
    expect(mensajeDe(respuesta(ejemplo('rag-query-sin-evidencia.json')))).toBeUndefined();
    const mensaje = mensajeDe(respuesta({ ...ejemplo('rag-query-sin-evidencia.json'), topRelevanceScore: 0.0 }));
    expect(mensaje).toMatch(/rag-orchestrator POST \/rag\/query 200: \/topRelevanceScore/);
  });
});

/** Spec sintético mínimo: lo que los specs reales aún no declaran (cabecera obligatoria, rango NXX, default). */
const specSintetico = {
  'clinical-api': {
    bundled: {
      openapi: '3.1.0',
      info: { title: 'sintético', version: '0.0.0' },
      paths: {
        '/cosas/{id}': {
          get: {
            responses: {
              200: {
                description: 'ok',
                headers: { 'X-Requerida': { required: true, schema: { type: 'string' } }, 'X-Opcional': { schema: { type: 'string' } } },
                content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } } } },
              },
              '4XX': { description: 'error', content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['error'], properties: { error: { type: 'string' } } } } } },
              default: { description: 'otro', content: { 'application/json': { schema: { type: 'object' } } } },
            },
          },
        },
        '/cosas/propias': { get: { responses: { 200: { description: 'ok' } } } },
      },
    },
  },
  'rag-orchestrator': { bundled: undefined },
};

describe('crearVerificadorDeRespuestas', () => {
  const verificar = crearVerificadorDeRespuestas(specSintetico);
  const base = { proveedor: 'clinical-api', metodo: 'get', ruta: '/cosas/abc', status: 200, cabeceras: { 'x-requerida': 'v' }, cuerpo: { ok: true } };

  it('acepta la cabecera obligatoria en cualquier capitalización y no exige la opcional', () => {
    expect(verificar(base)).toEqual({ plantilla: '/cosas/{id}', codigo: '200' });
    expect(verificar({ ...base, cabeceras: { 'X-REQUERIDA': 'v' } })).toEqual({ plantilla: '/cosas/{id}', codigo: '200' });
  });

  it('falla nombrando la cabecera cuando falta una declarada como obligatoria [US-214 AC-1]', () => {
    expect(() => verificar({ ...base, cabeceras: { 'x-opcional': 'v' } })).toThrow(
      'la respuesta no cumple clinical-api GET /cosas/{id} 200: header X-Requerida: cabecera obligatoria ausente',
    );
  });

  it('resuelve un status por rango NXX y por default cuando no hay código exacto', () => {
    expect(verificar({ ...base, status: 404, cuerpo: { error: 'x' } })).toEqual({ plantilla: '/cosas/{id}', codigo: '4XX' });
    expect(verificar({ ...base, status: 500, cuerpo: { cualquiera: 1 } })).toEqual({ plantilla: '/cosas/{id}', codigo: 'default' });
  });

  it('prefiere la plantilla con más segmentos literales sobre la que usa parámetros', () => {
    expect(verificar({ ...base, ruta: '/cosas/propias', cabeceras: {}, cuerpo: undefined })).toEqual({ plantilla: '/cosas/propias', codigo: '200' });
  });
});

describe('resolverOperacion', () => {
  const spec = specSintetico['clinical-api'].bundled;

  it('ignora la query, el fragmento y la barra final al buscar la plantilla', () => {
    expect(resolverOperacion(spec, 'GET', '/cosas/abc/?x=1#f')?.route).toBe('/cosas/{id}');
  });

  it('devuelve undefined cuando el método o el número de segmentos no coinciden', () => {
    expect(resolverOperacion(spec, 'post', '/cosas/abc')).toBeUndefined();
    expect(resolverOperacion(spec, 'get', '/cosas/abc/otro')).toBeUndefined();
  });

  it('devuelve undefined cuando dos plantillas distintas empatan en especificidad', () => {
    const ambiguo = { paths: { '/a/{x}': { get: { responses: {} } }, '/{y}/b': { get: { responses: {} } } } };
    expect(resolverOperacion(ambiguo, 'get', '/a/b')).toBeUndefined();
  });
});
