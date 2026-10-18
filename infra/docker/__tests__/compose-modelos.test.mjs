import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RAIZ, crearResolutor } from './lib/compose-resuelto.mjs';
import { assertModelosSoloLecturaFueraDelRepo } from './lib/reglas-compose.mjs';

// US-231a, tarea 1.14b (test después, infra): los pesos de los modelos entran por un bind mount de solo lectura desde un
// directorio del HOST fuera del repo; el Compose no tiene pesos propios y la CI usa MODEL_PROVIDER=fake [US-231a AC-8].

let resolver;
let limpiar;

beforeAll(() => {
  ({ resolver, limpiar } = crearResolutor());
});

afterAll(() => limpiar());

const rag = (config) => config.services['rag-orchestrator'];

/** Todas las claves de ADR-39 (app/config/modelos.py): con MODEL_PROVIDER=local el servicio las exige juntas. */
function clavesDeAdr39() {
  const fuente = readFileSync(path.join(RAIZ, 'apps/rag-orchestrator/app/config/modelos.py'), 'utf8');
  const bloques = [...fuente.matchAll(/^CLAVES_(?:MODELOS|CHUNKING_E_INDICE|RESTRICCIONES) = \(([\s\S]*?)\n\)/gm)];
  return bloques.flatMap(([, cuerpo]) => [...cuerpo.matchAll(/"([A-Z0-9_]+)"/g)].map(([, clave]) => clave));
}

describe('docker-compose.yml · modelos locales de recuperación', () => {
  it('monta los modelos de solo lectura desde un directorio del host fuera del repo y fuerza el modo sin conexión [US-231a AC-8]', () => {
    expect(() => assertModelosSoloLecturaFueraDelRepo(resolver(), RAIZ)).not.toThrow();
  });

  it('falla nombrando rag-orchestrator cuando MODEL_HOST_DIR apunta dentro del repositorio [US-231a AC-8]', () => {
    const config = resolver({ entorno: { MODEL_HOST_DIR: path.join(RAIZ, 'apps/rag-orchestrator') } });
    expect(() => assertModelosSoloLecturaFueraDelRepo(config, RAIZ)).toThrow(/rag-orchestrator.*dentro del repositorio/);
  });

  it('falla nombrando rag-orchestrator cuando un override quita read_only al montaje de modelos [US-231a AC-8]', () => {
    const modelos = resolver().services['rag-orchestrator'].volumes.find((v) => v.target === '/models').source;
    const override = `services:\n  rag-orchestrator:\n    volumes:\n      - type: bind\n        source: ${modelos}\n        target: /models\n        read_only: false\n`;
    expect(() => assertModelosSoloLecturaFueraDelRepo(resolver({ override }), RAIZ)).toThrow(/rag-orchestrator.*solo lectura/);
  });

  it('exige MODEL_HOST_DIR y no tiene valor por defecto dentro del repo [US-231a AC-8]', () => {
    expect(() => resolver({ entorno: { MODEL_HOST_DIR: '' } })).toThrow(/MODEL_HOST_DIR/);
    const compose = readFileSync(path.join(RAIZ, 'infra/docker/docker-compose.yml'), 'utf8');
    expect(compose).toMatch(/source: \$\{MODEL_HOST_DIR:\?/);
  });

  it('el destino del montaje sigue a MODEL_CACHE_DIR cuando el entorno lo fija [US-231a AC-8]', () => {
    const config = resolver({ entorno: { MODEL_CACHE_DIR: '/pesos' } });
    expect(rag(config).environment.MODEL_CACHE_DIR).toBe('/pesos');
    expect(rag(config).volumes.some((v) => v.target === '/pesos' && v.read_only === true)).toBe(true);
  });

  it('MODEL_PROVIDER es local en Compose y la CI lo cambia a fake con el entorno [US-231a AC-7]', () => {
    expect(rag(resolver()).environment.MODEL_PROVIDER).toBe('local');
    expect(rag(resolver({ entorno: { MODEL_PROVIDER: 'fake' } })).environment.MODEL_PROVIDER).toBe('fake');
  });

  it('pasa una ruta y un SHA-256 por cada archivo que se carga, vacíos cuando el entorno no los fija [US-231a AC-7]', () => {
    const entorno = rag(resolver()).environment;
    for (const modelo of ['EMBEDDING', 'RERANKER']) {
      for (const sufijo of ['MODEL_PATH', 'MODEL_SHA256', 'TOKENIZER_PATH', 'TOKENIZER_SHA256']) {
        expect(entorno[`${modelo}_${sufijo}`]).toBe('');
      }
    }
    const fijado = rag(resolver({ entorno: { RERANKER_MODEL_SHA256: 'a'.repeat(64) } })).environment;
    expect(fijado.RERANKER_MODEL_SHA256).toBe('a'.repeat(64));
  });

  it('pasa todas las claves de ADR-39 para que MODEL_PROVIDER=local pueda validarlas juntas [US-231a AC-7]', () => {
    const claves = clavesDeAdr39();
    expect(claves).toHaveLength(25);
    const entorno = rag(resolver()).environment;
    expect(claves.filter((clave) => !(clave in entorno))).toEqual([]);
  });

  it('no copia pesos a la imagen: el Dockerfile no los copia y los tres ignore los excluyen [US-231a AC-8]', () => {
    // `**/*.onnx.data` (US-231b, RN-14): así nombran `torch.onnx.export` y `quantize_dynamic` los datos externos de un ONNX.
    const patrones = ['.cache/', '**/model-cache/', '**/*.onnx', '**/*.onnx_data', '**/*.onnx.data', '**/*.safetensors'];
    const lineas = (ruta) =>
      readFileSync(path.join(RAIZ, ruta), 'utf8')
        .split('\n')
        .map((linea) => linea.trim());
    for (const ruta of ['.gitignore', '.dockerignore', 'apps/rag-orchestrator/Dockerfile.dockerignore']) {
      const presentes = lineas(ruta);
      expect(patrones.filter((patron) => !presentes.includes(patron)), ruta).toEqual([]);
    }
    const dockerfile = readFileSync(path.join(RAIZ, 'apps/rag-orchestrator/Dockerfile'), 'utf8');
    expect(dockerfile).not.toMatch(/COPY[^\n]*(models|modelos|\.onnx|safetensors)/i);
  });
});

// US-231b, tarea 1.1 (test después, RN-22): NLI de soporte, mapeo de clases por configuración y corpus real.
describe('docker-compose.yml · NLI local y corpus real', () => {
  it('pasa una ruta y un SHA-256 por cada archivo del NLI, y el par de datos externos, vacíos cuando el entorno no los fija [US-231b AC-4]', () => {
    const entorno = rag(resolver()).environment;
    for (const clave of ['MODEL_PATH', 'MODEL_SHA256', 'TOKENIZER_PATH', 'TOKENIZER_SHA256', 'MODEL_DATA_PATH', 'MODEL_DATA_SHA256']) {
      expect(entorno[`NLI_${clave}`], clave).toBe('');
    }
    const fijado = rag(resolver({ entorno: { NLI_MODEL_SHA256: 'b'.repeat(64) } })).environment;
    expect(fijado.NLI_MODEL_SHA256).toBe('b'.repeat(64));
  });

  it('el mapeo de clases del NLI es configuración versionada, sin valor por defecto en el Compose [US-231b AC-4]', () => {
    const entorno = rag(resolver()).environment;
    for (const clase of ['ENTAILMENT', 'NEUTRAL', 'CONTRADICTION']) {
      expect(entorno[`NLI_LABEL_INDEX_${clase}`], clase).toBe('');
    }
    const fijado = rag(resolver({ entorno: { NLI_LABEL_INDEX_NEUTRAL: '1' } })).environment;
    expect(fijado.NLI_LABEL_INDEX_NEUTRAL).toBe('1');
  });

  it('el catálogo se conecta con el rol rag_corpus sin contraseña en la URL y TLS obligatorio, y Milvus por la red de IA [US-231b AC-9]', () => {
    const entorno = rag(resolver()).environment;
    expect(entorno.CORPUS_DATABASE_URL).toMatch(/^postgresql\+psycopg:\/\/rag_corpus@postgres:5432\/[^?]+\?sslmode=require$/);
    expect(entorno.CORPUS_DATABASE_URL).not.toMatch(/rag_corpus:/);
    expect(entorno.MILVUS_URI).toBe('http://milvus-standalone:19530');
    expect(entorno.PG_RAG_CORPUS_PASSWORD_FILE).toBe('/run/secrets/pg_rag_corpus_password');
  });

  it('los plazos de conexión del corpus y el largo máximo del NLI viven en configuración y el entorno los puede cambiar [US-231b AC-9]', () => {
    const porDefecto = rag(resolver()).environment;
    const fijadas = rag(
      resolver({ entorno: { MILVUS_CONNECT_TIMEOUT_SECONDS: '9', CORPUS_CONNECT_TIMEOUT_SECONDS: '7', NLI_MAX_LENGTH: '256' } }),
    ).environment;
    expect([porDefecto.MILVUS_CONNECT_TIMEOUT_SECONDS, porDefecto.CORPUS_CONNECT_TIMEOUT_SECONDS, porDefecto.NLI_MAX_LENGTH]).toEqual(['5', '5', '512']);
    expect([fijadas.MILVUS_CONNECT_TIMEOUT_SECONDS, fijadas.CORPUS_CONNECT_TIMEOUT_SECONDS, fijadas.NLI_MAX_LENGTH]).toEqual(['9', '7', '256']);
  });
});
