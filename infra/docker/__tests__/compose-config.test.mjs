import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

const RAIZ = path.resolve(import.meta.dirname, '../../..');
const COMPOSE = path.join(RAIZ, 'infra/docker/docker-compose.yml');
const ENV_EXAMPLE = path.join(RAIZ, 'infra/docker/.env.example');

let temporal;
let secretos;

beforeAll(() => {
  temporal = mkdtempSync(path.join(os.tmpdir(), 'oncolens-compose-'));
  secretos = path.join(temporal, 'secretos');
  execFileSync(path.join(RAIZ, 'scripts/smoke/lib/fake-secrets.sh'), [secretos], { stdio: 'pipe' });
});

afterAll(() => rmSync(temporal, { recursive: true, force: true }));

/** Compose resuelto con secretos ficticios; `override` es el YAML de un `-f` adicional y `entorno` variables extra. */
function resolver({ override, entorno = {} } = {}) {
  const archivos = ['-f', COMPOSE];
  if (override) {
    const archivo = path.join(temporal, `override-${Math.random().toString(36).slice(2)}.yml`);
    writeFileSync(archivo, override);
    archivos.push('-f', archivo);
  }
  const salida = execFileSync('docker', ['compose', ...archivos, 'config', '--format', 'json'], {
    env: { ...process.env, ONCOLENS_SECRETS_DIR: secretos, ...entorno },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(salida);
}

describe('docker-compose.yml', () => {
  it('declara los ocho servicios con healthcheck y tags exactos sin que clinical-api dependa de rag-orchestrator [US-034 AC-1]', () => {
    expect(() => assertStackCompleto(resolver())).not.toThrow();
  });

  it('solo web publica un puerto [US-034 AC-2]', () => {
    expect(() => assertSoloWebPublicaPuertos(resolver())).not.toThrow();
  });

  it('falla nombrando clinical-api cuando un override le publica un puerto [US-034 AC-2]', () => {
    const config = resolver({ override: 'services:\n  clinical-api:\n    ports:\n      - "8080:3000"\n' });
    expect(() => assertSoloWebPublicaPuertos(config)).toThrow(/clinical-api/);
  });

  it('falla nombrando rag-orchestrator cuando un override le publica un puerto [US-034 AC-2]', () => {
    const config = resolver({ override: 'services:\n  rag-orchestrator:\n    ports:\n      - "8000:8000"\n' });
    expect(() => assertSoloWebPublicaPuertos(config)).toThrow(/rag-orchestrator/);
  });

  it('no hay servicio de LLM y LLM_BASE_URL apunta a host.docker.internal desde configuración [US-034 AC-5]', () => {
    const porDefecto = resolver();
    expect(() => assertSinServicioDeLlm(porDefecto)).not.toThrow();
    const configurada = resolver({ entorno: { LLM_BASE_URL: 'http://host.docker.internal:18080/v1' } });
    expect(configurada.services['rag-orchestrator'].environment.LLM_BASE_URL).toBe('http://host.docker.internal:18080/v1');
  });

  it('falla nombrando el servicio cuando un override añade ollama [US-034 AC-5]', () => {
    const config = resolver({ override: 'services:\n  ollama:\n    image: ollama/ollama:0.34.4\n' });
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
    const config = resolver({ override: 'services:\n  rag-orchestrator:\n    networks:\n      - clinical-net\n' });
    expect(() => assertAislamientoDeRedes(config)).toThrow(/rag-orchestrator/);
  });

  it('cada backend recibe solo su clave del JWT y .env.example declara APP_ENV [US-034 AC-3]', () => {
    expect(() => assertClavesPorServicio(resolver())).not.toThrow();
    expect(readFileSync(ENV_EXAMPLE, 'utf8')).toMatch(/^APP_ENV=local$/m);
  });

  it('falla nombrando rag-orchestrator cuando un override le monta la clave privada del JWT [US-034 AC-3]', () => {
    const config = resolver({ override: 'services:\n  rag-orchestrator:\n    secrets:\n      - jwt_service_private.pem\n' });
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
    expect(() => assertTtlDelJwtCompartido(resolver({ entorno: { SERVICE_JWT_TTL_SECONDS: '30' } }))).not.toThrow();
  });

  it('falla nombrando ambos servicios cuando un override cambia el SERVICE_JWT_TTL_SECONDS de rag-orchestrator [US-054 AC-5]', () => {
    const config = resolver({ override: 'services:\n  rag-orchestrator:\n    environment:\n      SERVICE_JWT_TTL_SECONDS: "3600"\n' });
    expect(() => assertTtlDelJwtCompartido(config)).toThrow(/clinical-api.*rag-orchestrator/);
  });
});
