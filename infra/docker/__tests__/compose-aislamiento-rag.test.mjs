import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearResolutor } from './lib/compose-resuelto.mjs';
import { assertRagSinCredencialesClinicas } from './lib/reglas-secretos.mjs';

let resolver;
let limpiar;

beforeAll(() => {
  ({ resolver, limpiar } = crearResolutor());
});

afterAll(() => limpiar());

// Cada llamada resuelve el Compose con `docker compose config` (varios segundos en frío): tope explícito.
const TOPE_MS = 60_000;

describe('docker-compose.yml · aislamiento de rag-orchestrator (US-040)', () => {
  it('el servicio rag-orchestrator no tiene credenciales de clinical_api ni de clinical-minio [US-040 AC-5]', () => {
    expect(() => assertRagSinCredencialesClinicas(resolver())).not.toThrow();
  }, TOPE_MS);

  it('falla nombrando el secreto cuando un override le monta la contraseña de clinical_api [US-040 AC-5]', () => {
    const config = resolver({ override: 'services:\n  rag-orchestrator:\n    secrets:\n      - pg_clinical_api_password\n' });
    expect(() => assertRagSinCredencialesClinicas(config)).toThrow(/rag-orchestrator.*pg_clinical_api_password/);
  }, TOPE_MS);

  it('compara por el archivo y no por el alias cuando un override monta la contraseña de clinical-minio con otro nombre [US-040 AC-5]', () => {
    const override = 'services:\n  rag-orchestrator:\n    secrets:\n      - alias_inocente\nsecrets:\n  alias_inocente:\n    file: ${ONCOLENS_SECRETS_DIR}/clinical_minio_root_password\n';
    expect(() => assertRagSinCredencialesClinicas(resolver({ override }))).toThrow(/rag-orchestrator.*clinical_minio_root_password/);
  }, TOPE_MS);

  it('falla nombrando la variable cuando un override le declara la ruta de la contraseña de clinical-minio [US-040 AC-5]', () => {
    const config = resolver({ override: 'services:\n  rag-orchestrator:\n    environment:\n      CLINICAL_MINIO_PASSWORD_FILE: /run/secrets/clinical_minio_root_password\n' });
    expect(() => assertRagSinCredencialesClinicas(config)).toThrow(/rag-orchestrator.*CLINICAL_MINIO_PASSWORD_FILE/);
  }, TOPE_MS);

  it('falla nombrando la variable cuando un override le da una URL de base de datos con el usuario clinical_api [US-040 AC-5]', () => {
    const config = resolver({ override: 'services:\n  rag-orchestrator:\n    environment:\n      CORPUS_DATABASE_URL: postgresql://clinical_api@postgres:5432/oncolens\n' });
    expect(() => assertRagSinCredencialesClinicas(config)).toThrow(/rag-orchestrator.*CORPUS_DATABASE_URL/);
  }, TOPE_MS);

  it('falla nombrando la variable cuando un override apunta un destino a clinical-minio [US-040 AC-5]', () => {
    const config = resolver({ override: 'services:\n  rag-orchestrator:\n    environment:\n      STORAGE_ENDPOINT: http://clinical-minio:9000\n' });
    expect(() => assertRagSinCredencialesClinicas(config)).toThrow(/rag-orchestrator.*STORAGE_ENDPOINT/);
  }, TOPE_MS);
});
