import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENV_EXAMPLE, RAIZ, crearResolutor } from './lib/compose-resuelto.mjs';
import {
  assertAislamientoDeRedes,
  assertCatalogoSoloLectura,
  assertClavesPorServicio,
  assertRagSoloLecturaConTmpfs,
  assertSinServicioDeLlm,
  assertSoloWebPublicaPuertos,
  assertTtlDelJwtCompartido,
  assertStackCompleto,
} from './lib/reglas-compose.mjs';

let resolver;
let limpiar;

beforeAll(() => {
  ({ resolver, limpiar } = crearResolutor());
});

afterAll(() => limpiar());

describe('docker-compose.yml', () => {
  it('declara los diez servicios (ocho con healthcheck y los one-shot corpus-migrate y clinical-seed) y tags exactos sin que clinical-api dependa de rag-orchestrator [US-034 AC-1]', () => {
    expect(() => assertStackCompleto(resolver())).not.toThrow();
  });

  it('falla nombrando web cuando un servicio long-running no declara healthcheck [US-034 AC-1]', () => {
    const config = resolver();
    delete config.services.web.healthcheck;
    expect(() => assertStackCompleto(config)).toThrow(/web no declara healthcheck/);
  });

  it('falla nombrando corpus-migrate cuando deja de ser one-shot y no declara healthcheck [US-034 AC-1]', () => {
    const config = resolver();
    config.services['corpus-migrate'].restart = 'unless-stopped';
    expect(() => assertStackCompleto(config)).toThrow(/corpus-migrate no declara healthcheck/);
  });

  it('solo web publica un puerto [US-034 AC-2]', () => {
    expect(() => assertSoloWebPublicaPuertos(resolver())).not.toThrow();
  });

  it('falla nombrando clinical-api cuando un override le publica un puerto [US-034 AC-2]', () => {
    const config = resolver({
      override: 'services:\n  clinical-api:\n    ports:\n      - "8080:3000"\n',
    });
    expect(() => assertSoloWebPublicaPuertos(config)).toThrow(/clinical-api/);
  });

  it('falla nombrando rag-orchestrator cuando un override le publica un puerto [US-034 AC-2]', () => {
    const config = resolver({
      override: 'services:\n  rag-orchestrator:\n    ports:\n      - "8000:8000"\n',
    });
    expect(() => assertSoloWebPublicaPuertos(config)).toThrow(/rag-orchestrator/);
  });

  it('no hay servicio de LLM y LLM_BASE_URL apunta a host.docker.internal desde configuración [US-034 AC-5]', () => {
    const porDefecto = resolver();
    expect(() => assertSinServicioDeLlm(porDefecto)).not.toThrow();
    const configurada = resolver({
      entorno: { LLM_BASE_URL: 'http://host.docker.internal:18080/v1' },
    });
    expect(configurada.services['rag-orchestrator'].environment.LLM_BASE_URL).toBe(
      'http://host.docker.internal:18080/v1',
    );
  });

  it('falla nombrando el servicio cuando un override añade ollama [US-034 AC-5]', () => {
    const config = resolver({
      override: 'services:\n  ollama:\n    image: ollama/ollama:0.34.4\n',
    });
    expect(() => assertSinServicioDeLlm(config)).toThrow(/ollama/);
  });

  it('falla nombrando rag-orchestrator cuando LLM_BASE_URL deja de apuntar a host.docker.internal [US-034 AC-5]', () => {
    const config = resolver({ entorno: { LLM_BASE_URL: 'http://llm-en-compose:11434/v1' } });
    expect(() => assertSinServicioDeLlm(config)).toThrow(/rag-orchestrator/);
  });

  it('rag-orchestrator es de solo lectura con TMPDIR en tmpfs [US-034 AC-3]', () => {
    expect(() => assertRagSoloLecturaConTmpfs(resolver())).not.toThrow();
  });

  it('falla nombrando rag-orchestrator cuando un override quita read_only [US-034 AC-3]', () => {
    const config = resolver({ override: 'services:\n  rag-orchestrator:\n    read_only: false\n' });
    expect(() => assertRagSoloLecturaConTmpfs(config)).toThrow(/rag-orchestrator/);
  });

  it('rag-orchestrator no comparte red con clinical-minio y corpus-db-net es interna [US-034 AC-3]', () => {
    expect(() => assertAislamientoDeRedes(resolver())).not.toThrow();
  });

  it('falla nombrando rag-orchestrator cuando un override lo une a la red de clinical-minio [US-034 AC-3]', () => {
    const config = resolver({
      override: 'services:\n  rag-orchestrator:\n    networks:\n      - clinical-net\n',
    });
    expect(() => assertAislamientoDeRedes(config)).toThrow(/rag-orchestrator/);
  });

  it('cada backend recibe solo su clave del JWT y .env.example declara APP_ENV [US-034 AC-3]', () => {
    expect(() => assertClavesPorServicio(resolver())).not.toThrow();
    expect(readFileSync(ENV_EXAMPLE, 'utf8')).toMatch(/^APP_ENV=local$/m);
  });

  it('falla nombrando rag-orchestrator cuando un override le monta la clave privada del JWT [US-034 AC-3]', () => {
    const config = resolver({
      override: 'services:\n  rag-orchestrator:\n    secrets:\n      - jwt_service_private.pem\n',
    });
    expect(() => assertClavesPorServicio(config)).toThrow(/rag-orchestrator/);
  });

  it('clinical-api y rag-orchestrator montan packages/clinical-catalogs de solo lectura en CLINICAL_CATALOG_PATH, web no lo monta y .env.example declara CLINICAL_CATALOG_PATH [US-034 AC-3]', () => {
    expect(() => assertCatalogoSoloLectura(resolver())).not.toThrow();
    expect(readFileSync(ENV_EXAMPLE, 'utf8')).toMatch(/^CLINICAL_CATALOG_PATH=\S+$/m);
  });

  it('falla nombrando el servicio cuando un override quita read_only al montaje del catálogo [US-034 AC-3]', () => {
    const catalogo = path.join(RAIZ, 'packages/clinical-catalogs');
    const override = `services:\n  clinical-api:\n    volumes:\n      - type: bind\n        source: ${catalogo}\n        target: /catalogs\n        read_only: false\n`;
    expect(() => assertCatalogoSoloLectura(resolver({ override }))).toThrow(/clinical-api/);
  });

  it('clinical-api y rag-orchestrator reciben el mismo SERVICE_JWT_TTL_SECONDS [US-054 AC-5]', () => {
    expect(() => assertTtlDelJwtCompartido(resolver())).not.toThrow();
    expect(() =>
      assertTtlDelJwtCompartido(resolver({ entorno: { SERVICE_JWT_TTL_SECONDS: '30' } })),
    ).not.toThrow();
  });

  it('rag-orchestrator recibe los valores provisionales de la recuperación y el entorno los puede cambiar [L1D-106 RN-22]', () => {
    const porDefecto = resolver().services['rag-orchestrator'].environment;
    const fijadas = resolver({
      entorno: { RELEVANCE_THRESHOLD: '0.45', RETRIEVAL_TOP_K: '20', RERANK_TOP_N: '5' },
    }).services['rag-orchestrator'].environment;

    expect([
      porDefecto.RELEVANCE_THRESHOLD,
      porDefecto.RETRIEVAL_TOP_K,
      porDefecto.RERANK_TOP_N,
    ]).toEqual(['0.30', '30', '10']);
    expect([fijadas.RELEVANCE_THRESHOLD, fijadas.RETRIEVAL_TOP_K, fijadas.RERANK_TOP_N]).toEqual([
      '0.45',
      '20',
      '5',
    ]);
  });

  it('clinical-api resuelve a vacío SESSION_TTL_HOURS y ARGON2_* cuando el entorno no los fija: el valor por defecto vive solo en config.ts (RN-22) [US-211 AC-1]', () => {
    const variables = [
      'SESSION_TTL_HOURS',
      'ARGON2_MEMORY_COST_KIB',
      'ARGON2_TIME_COST',
      'ARGON2_PARALLELISM',
    ];
    const sinFijar = resolver().services['clinical-api'].environment;
    const fijadas = resolver({ entorno: { SESSION_TTL_HOURS: '4', ARGON2_TIME_COST: '3' } })
      .services['clinical-api'].environment;

    for (const variable of variables) expect(sinFijar[variable]).toBe('');
    expect(fijadas.SESSION_TTL_HOURS).toBe('4');
    expect(fijadas.ARGON2_TIME_COST).toBe('3');
  });

  it('clinical-api resuelve a vacío las claves de bloqueo del login y de trust proxy cuando el entorno no las fija, y las pasa cuando sí [US-044 AC-2] [US-044 AC-3]', () => {
    const variables = ['LOGIN_MAX_FAILED_ATTEMPTS', 'LOGIN_LOCKOUT_MINUTES', 'TRUST_PROXY_HOPS'];
    const sinFijar = resolver().services['clinical-api'].environment;
    const fijadas = resolver({
      entorno: {
        LOGIN_MAX_FAILED_ATTEMPTS: '3',
        LOGIN_LOCKOUT_MINUTES: '20',
        TRUST_PROXY_HOPS: '2',
      },
    }).services['clinical-api'].environment;

    for (const variable of variables) expect(sinFijar[variable]).toBe('');
    expect([
      fijadas.LOGIN_MAX_FAILED_ATTEMPTS,
      fijadas.LOGIN_LOCKOUT_MINUTES,
      fijadas.TRUST_PROXY_HOPS,
    ]).toEqual(['3', '20', '2']);
  });

  it('web recibe CLINICAL_API_URL, WEB_ALLOWED_ORIGIN y WEB_UPSTREAM_TIMEOUT_MS de servidor y ninguna NEXT_PUBLIC_ [US-060 AC-5]', () => {
    const entorno = resolver().services.web.environment;
    expect(entorno).toMatchObject({
      CLINICAL_API_URL: 'http://clinical-api:3000',
      WEB_ALLOWED_ORIGIN: 'http://127.0.0.1:3000',
      WEB_UPSTREAM_TIMEOUT_MS: '40000',
      WEB_MAX_BODY_BYTES: '32768',
    });
    expect(Object.keys(entorno).filter((nombre) => nombre.startsWith('NEXT_PUBLIC_'))).toEqual([]);
  });

  it('rag-orchestrator recibe los topes de la salida del LLM y de las afirmaciones con sus valores por defecto y los respeta cuando se fijan [ARR-08] [US-245]', () => {
    const porDefecto = resolver().services['rag-orchestrator'].environment;
    const fijadas = resolver({
      entorno: {
        CLAIMS_MIN_PER_OPTION: '2',
        CLAIMS_MAX_PER_OPTION: '3',
        CLAIM_MAX_WORDS: '15',
        LLM_FRAGMENTS_MAX_CHARS: '8000',
      },
    }).services['rag-orchestrator'].environment;

    expect(porDefecto).toMatchObject({
      LLM_MAX_OUTPUT_TOKENS: '2048',
      LLM_FRAGMENTS_MAX_CHARS: '12000',
      CLAIMS_MIN_PER_OPTION: '1',
      CLAIMS_MAX_PER_OPTION: '4',
      CLAIM_MAX_WORDS: '20',
    });
    expect(porDefecto).not.toHaveProperty('DETAILS_MAX_PARAGRAPHS');
    expect(fijadas).toMatchObject({
      CLAIMS_MIN_PER_OPTION: '2',
      CLAIMS_MAX_PER_OPTION: '3',
      CLAIM_MAX_WORDS: '15',
      LLM_FRAGMENTS_MAX_CHARS: '8000',
    });
  });

  it('web recibe WEB_HOME_PATH del entorno y resuelve a vacío si no se fija', () => {
    const fijada = resolver({ entorno: { WEB_HOME_PATH: '/pacientes/p/analisis' } }).services.web
      .environment;
    expect(fijada.WEB_HOME_PATH).toBe('/pacientes/p/analisis');
    expect(resolver().services.web.environment.WEB_HOME_PATH).toBe('');
  });

  it('falla nombrando ambos servicios cuando un override cambia el SERVICE_JWT_TTL_SECONDS de rag-orchestrator [US-054 AC-5]', () => {
    const config = resolver({
      override:
        'services:\n  rag-orchestrator:\n    environment:\n      SERVICE_JWT_TTL_SECONDS: "3600"\n',
    });
    expect(() => assertTtlDelJwtCompartido(config)).toThrow(/clinical-api.*rag-orchestrator/);
  });
});
