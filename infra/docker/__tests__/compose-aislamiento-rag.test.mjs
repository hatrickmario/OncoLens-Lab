import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearResolutor } from './lib/compose-resuelto.mjs';
import { assertRagSinVariablesDeClinical } from './lib/reglas-compose.mjs';
import { assertRepartoDeSecretos } from './lib/reglas-secretos.mjs';

let resolver;
let limpiar;

beforeAll(() => {
  ({ resolver, limpiar } = crearResolutor());
});

afterAll(() => limpiar());

// Cada llamada resuelve el Compose con `docker compose config` (varios segundos en frío): tope explícito.
const TOPE_MS = 60_000;

// Los secretos de rag-orchestrator (solo la pública del JWT y la contraseña de rag_corpus) los impone
// assertRepartoDeSecretos; sus mutaciones están en compose-secrets.test.mjs [US-035 AC-2].
describe('docker-compose.yml · aislamiento de rag-orchestrator (US-040)', () => {
  it('el servicio rag-orchestrator no tiene credenciales de clinical_api ni de clinical-minio [US-040 AC-5]', () => {
    const config = resolver();

    expect(() => assertRepartoDeSecretos(config)).not.toThrow();
    expect(() => assertRagSinVariablesDeClinical(config)).not.toThrow();
  }, TOPE_MS);

  it('falla nombrando la variable cuando un override le declara la ruta de la contraseña de clinical-minio [US-040 AC-5]', () => {
    const config = resolver({ override: 'services:\n  rag-orchestrator:\n    environment:\n      CLINICAL_MINIO_PASSWORD_FILE: /run/secrets/clinical_minio_root_password\n' });
    expect(() => assertRagSinVariablesDeClinical(config)).toThrow(/rag-orchestrator.*CLINICAL_MINIO_PASSWORD_FILE/);
  }, TOPE_MS);

  it('falla nombrando la variable cuando un override le da una URL de base de datos con el usuario clinical_api [US-040 AC-5]', () => {
    const config = resolver({ override: 'services:\n  rag-orchestrator:\n    environment:\n      CORPUS_DATABASE_URL: postgresql://clinical_api@postgres:5432/oncolens\n' });
    expect(() => assertRagSinVariablesDeClinical(config)).toThrow(/rag-orchestrator.*CORPUS_DATABASE_URL/);
  }, TOPE_MS);

  it('falla nombrando la variable cuando un override apunta un destino a clinical-minio [US-040 AC-5]', () => {
    const config = resolver({ override: 'services:\n  rag-orchestrator:\n    environment:\n      STORAGE_ENDPOINT: http://clinical-minio:9000\n' });
    expect(() => assertRagSinVariablesDeClinical(config)).toThrow(/rag-orchestrator.*STORAGE_ENDPOINT/);
  }, TOPE_MS);
});
