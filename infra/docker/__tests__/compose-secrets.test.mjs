import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COMPOSE_TEST, crearResolutor } from './lib/compose-resuelto.mjs';
import { assertPostgresConTls, assertRepartoDeSecretos, assertSinSecretosEnEntorno } from './lib/reglas-secretos.mjs';

let resolver;
let limpiar;

beforeAll(() => {
  ({ resolver, limpiar } = crearResolutor());
});

afterAll(() => limpiar());

// Los one-shot corpus-migrate (L1D-114) y clinical-seed (L1D-169) aún no existen: el override los simula.
const UN_SERVICIO = (nombre, secretos) =>
  `  ${nombre}:\n    image: busybox:1.37.0\n    secrets: [${secretos.join(', ')}]\n`;
const SECRETOS_DEL_SEED = 'secrets:\n  seed_doctor_password:\n    file: /dev/null\n  seed_admin_password:\n    file: /dev/null\n';

describe('docker-compose.yml · reparto de secretos', () => {
  it('monta la privada del JWT, la AES y la HMAC solo en clinical-api y entrega a rag-orchestrator exactamente la pública del JWT y la contraseña de rag_corpus [US-035 AC-2]', () => {
    const config = resolver();
    expect(() => assertRepartoDeSecretos(config)).not.toThrow();
    const montados = (nombre) => (config.services[nombre].secrets ?? []).map((secreto) => secreto.source).sort();
    expect(montados('rag-orchestrator')).toEqual(['jwt_service_public.pem', 'pg_rag_corpus_password']);
    for (const secreto of ['jwt_service_private.pem', 'identity_aes_key', 'blind_index_hmac_key']) {
      const conSecreto = Object.keys(config.services).filter((nombre) => montados(nombre).includes(secreto));
      expect(conSecreto).toEqual(['clinical-api']);
    }
  });

  it('no entrega ningún secreto a web [US-035 AC-2]', () => {
    const config = resolver();
    expect(config.services.web.secrets ?? []).toEqual([]);
    expect(() => assertRepartoDeSecretos(config)).not.toThrow();
  });

  it('entrega los secretos por archivo (*_FILE) y no deja ningún valor secreto en environment [US-035 AC-2]', () => {
    expect(() => assertSinSecretosEnEntorno(resolver())).not.toThrow();
  });

  it('falla nombrando rag-orchestrator cuando un override le monta un valor secreto en environment [US-035 AC-2]', () => {
    const config = resolver({ override: 'services:\n  rag-orchestrator:\n    environment:\n      PG_RAG_CORPUS_PASSWORD: ficticio\n' });
    expect(() => assertSinSecretosEnEntorno(config)).toThrow(/rag-orchestrator.*PG_RAG_CORPUS_PASSWORD/);
  });

  it('falla nombrando rag-orchestrator e identity_aes_key cuando un override se la monta [US-035 AC-2]', () => {
    const config = resolver({ override: 'services:\n  rag-orchestrator:\n    secrets:\n      - identity_aes_key\n' });
    expect(() => assertRepartoDeSecretos(config)).toThrow(/rag-orchestrator.*identity_aes_key/);
  });

  it('falla nombrando rag-orchestrator y pg_rag_corpus_migrator_password cuando un override se la monta [US-035 AC-2]', () => {
    const config = resolver({ override: 'services:\n  rag-orchestrator:\n    secrets:\n      - pg_rag_corpus_migrator_password\n' });
    expect(() => assertRepartoDeSecretos(config)).toThrow(/rag-orchestrator.*pg_rag_corpus_migrator_password/);
  });

  it('falla nombrando clinical-api y seed_admin_password cuando un override monta la contraseña del seed en un servicio de runtime [US-035 AC-2]', () => {
    const config = resolver({ override: `services:\n  clinical-api:\n    secrets:\n      - seed_admin_password\n${SECRETOS_DEL_SEED}` });
    expect(() => assertRepartoDeSecretos(config)).toThrow(/clinical-api.*seed_admin_password/);
  });

  it('acepta corpus-migrate con solo la contraseña del migrator y clinical-seed con solo las del seed cuando esos one-shot existen [US-035 AC-2]', () => {
    const override = `services:\n${UN_SERVICIO('corpus-migrate', ['pg_rag_corpus_migrator_password'])}${UN_SERVICIO('clinical-seed', ['pg_clinical_api_password', 'seed_doctor_password', 'seed_admin_password'])}${SECRETOS_DEL_SEED}`;
    expect(() => assertRepartoDeSecretos(resolver({ override }))).not.toThrow();
  });

  it('falla nombrando corpus-migrate y pg_clinical_api_password cuando el one-shot del migrator recibe otro secreto [US-035 AC-2]', () => {
    const override = `services:\n${UN_SERVICIO('corpus-migrate', ['pg_rag_corpus_migrator_password', 'pg_clinical_api_password'])}`;
    expect(() => assertRepartoDeSecretos(resolver({ override }))).toThrow(/corpus-migrate.*pg_clinical_api_password/);
  });
});

describe('docker-compose.yml · PostgreSQL con TLS', () => {
  it('arranca postgres con ssl=on, el pg_hba.conf generado y subredes fijas para clinical-net y corpus-db-net [US-035 AC-4]', () => {
    expect(() => assertPostgresConTls(resolver())).not.toThrow();
  });

  it('falla nombrando postgres cuando un override le quita ssl=on [US-035 AC-4]', () => {
    const config = resolver({ override: 'services:\n  postgres:\n    command: !override\n      - postgres\n      - -c\n      - hba_file=/run/secrets/pg_hba.conf\n' });
    expect(() => assertPostgresConTls(config)).toThrow(/postgres.*ssl=on/);
  });

  it('el perfil test solo añade pg_hba.test.conf y pg_test_admin_password al servicio postgres [US-035 AC-1]', () => {
    const config = resolver({ archivosExtra: [COMPOSE_TEST] });
    const secretos = config.services.postgres.secrets.map((secreto) => secreto.source);
    expect(secretos).toEqual(expect.arrayContaining(['pg_test_admin_password', 'pg_hba.test.conf']));
    expect(config.services.postgres.environment.ONCOLENS_PG_PROFILE).toBe('test');
    expect(() => assertRepartoDeSecretos(config)).not.toThrow();
    const sinPerfil = resolver().services.postgres.environment.ONCOLENS_PG_PROFILE;
    expect(sinPerfil).toBeUndefined();
  });
});
