import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COMPOSE, COMPOSE_TEST, ENV_EXAMPLE, RAIZ, crearResolutor } from './lib/compose-resuelto.mjs';
import { assertAppsConUsuarioDeLosSecretos, assertPostgresConTls, assertRepartoDeSecretos, assertSinSecretosEnEntorno } from './lib/reglas-secretos.mjs';

let resolver;
let limpiar;

beforeAll(() => {
  ({ resolver, limpiar } = crearResolutor());
});

afterAll(() => limpiar());

// El one-shot corpus-migrate (L1D-114) aún no existe: el override lo simula. clinical-seed (L1D-169) ya está en el Compose.
const UN_SERVICIO = (nombre, secretos) =>
  `  ${nombre}:\n    image: busybox:1.37.0\n    secrets: [${secretos.join(', ')}]\n`;
const SECRETOS_DEL_SEED = 'secrets:\n  seed_doctor_password:\n    file: ${ONCOLENS_SECRETS_DIR}/seed_doctor_password\n  seed_admin_password:\n    file: ${ONCOLENS_SECRETS_DIR}/seed_admin_password\n';

describe('docker-compose.yml · reparto de secretos', () => {
  it('monta la privada del JWT, la AES y la HMAC solo en clinical-api y entrega a rag-orchestrator exactamente la pública del JWT y la contraseña de rag_corpus [US-035 AC-2]', () => {
    const config = resolver();
    expect(() => assertRepartoDeSecretos(config)).not.toThrow();
    const montados = (nombre) => (config.services[nombre].secrets ?? []).map((secreto) => secreto.source).sort();
    expect(montados('rag-orchestrator')).toEqual(['jwt_service_public.pem', 'pg_rag_corpus_password']);
    // Las dos claves de la identidad también las monta el one-shot clinical-seed (US-046 AC-6); nunca rag-orchestrator ni web.
    const duenos = {
      'jwt_service_private.pem': ['clinical-api'],
      identity_aes_key: ['clinical-api', 'clinical-seed'],
      blind_index_hmac_key: ['clinical-api', 'clinical-seed'],
    };
    for (const [secreto, esperados] of Object.entries(duenos)) {
      const conSecreto = Object.keys(config.services).filter((nombre) => montados(nombre).includes(secreto));
      expect(conSecreto.sort()).toEqual(esperados);
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

  it('falla nombrando clinical-api y pg_ca.key cuando un override le monta la clave de la CA [US-035 AC-2]', () => {
    const override = 'services:\n  clinical-api:\n    secrets:\n      - pg_ca.key\nsecrets:\n  pg_ca.key:\n    file: ${ONCOLENS_SECRETS_DIR}/pg_ca.key\n';
    expect(() => assertRepartoDeSecretos(resolver({ override }))).toThrow(/clinical-api.*pg_ca\.key/);
  });

  it('falla nombrando el secreto sin dueño declarado cuando un override monta un secreto que no está en la tabla [US-035 AC-2]', () => {
    const override = 'services:\n  clinical-api:\n    secrets:\n      - secreto_nuevo\nsecrets:\n  secreto_nuevo:\n    file: ${ONCOLENS_SECRETS_DIR}/secreto_nuevo\n';
    expect(() => assertRepartoDeSecretos(resolver({ override }))).toThrow(/sin dueño declarado.*secreto_nuevo/);
  });

  it('compara por el archivo y no por el alias cuando un override monta identity_aes_key con otro nombre en rag-orchestrator [US-035 AC-2]', () => {
    const override = 'services:\n  rag-orchestrator:\n    secrets:\n      - alias_inocente\nsecrets:\n  alias_inocente:\n    file: ${ONCOLENS_SECRETS_DIR}/identity_aes_key\n';
    expect(() => assertRepartoDeSecretos(resolver({ override }))).toThrow(/rag-orchestrator.*identity_aes_key/);
  });

  it('falla nombrando clinical-api cuando un override monta el directorio de secretos como volumen [US-035 AC-2]', () => {
    const override = 'services:\n  clinical-api:\n    volumes:\n      - ${ONCOLENS_SECRETS_DIR}:/secretos:ro\n';
    expect(() => assertRepartoDeSecretos(resolver({ override }))).toThrow(/clinical-api.*directorio de secretos/);
  });

  it('acepta corpus-migrate con solo la contraseña del migrator cuando ese one-shot existe [US-035 AC-2]', () => {
    const override = `services:\n${UN_SERVICIO('corpus-migrate', ['pg_rag_corpus_migrator_password'])}`;
    expect(() => assertRepartoDeSecretos(resolver({ override }))).not.toThrow();
  });

  it('falla nombrando corpus-migrate y pg_clinical_api_password cuando el one-shot del migrator recibe otro secreto [US-035 AC-2]', () => {
    const override = `services:\n${UN_SERVICIO('corpus-migrate', ['pg_rag_corpus_migrator_password', 'pg_clinical_api_password'])}`;
    expect(() => assertRepartoDeSecretos(resolver({ override }))).toThrow(/corpus-migrate.*pg_clinical_api_password/);
  });
});

describe('docker-compose.yml · catálogo de secretos', () => {
  it('declara solo secretos que están en el catálogo de scripts/lib/catalogo-secretos.sh, perfil test incluido [US-035 AC-1]', () => {
    const catalogo = execFileSync('bash', ['-c', `source "${path.join(RAIZ, 'scripts/lib/catalogo-secretos.sh')}"; archivos_del_catalogo test`], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    const declarados = Object.keys(resolver({ archivosExtra: [COMPOSE_TEST] }).secrets ?? {});

    expect(declarados.length).toBeGreaterThan(0);
    expect(declarados.filter((nombre) => !catalogo.includes(nombre))).toEqual([]);
  });
});

describe('docker-compose.yml · lectura de los secretos sin relajar permisos', () => {
  it('ejecuta clinical-api y rag-orchestrator con el uid y gid dueños de los secretos (ONCOLENS_UID y ONCOLENS_GID) [US-035 AC-2]', () => {
    const config = resolver({ entorno: { ONCOLENS_UID: '4242', ONCOLENS_GID: '4343' } });

    expect(() => assertAppsConUsuarioDeLosSecretos(config)).not.toThrow();
    expect(config.services['clinical-api'].user).toBe('4242:4343');
    expect(config.services['rag-orchestrator'].user).toBe('4242:4343');
  });

  it('falla nombrando rag-orchestrator cuando un override lo ejecuta con otro usuario [US-035 AC-2]', () => {
    const config = resolver({ override: 'services:\n  rag-orchestrator:\n    user: "10001"\n' });
    expect(() => assertAppsConUsuarioDeLosSecretos(config)).toThrow(/rag-orchestrator/);
  });

  it('declara ONCOLENS_UID y ONCOLENS_GID en .env.example con el mismo valor por defecto que el Compose [US-035 AC-2]', () => {
    const compose = readFileSync(COMPOSE, 'utf8');
    const ejemplo = readFileSync(ENV_EXAMPLE, 'utf8');
    for (const variable of ['ONCOLENS_UID', 'ONCOLENS_GID']) {
      const enEjemplo = ejemplo.match(new RegExp(`^${variable}=(\\d+)$`, 'm'))?.[1];
      const enCompose = [...compose.matchAll(new RegExp(`\\$\\{${variable}:-([^}]*)\\}`, 'g'))].map((coincidencia) => coincidencia[1]);

      expect(enEjemplo, `${variable} en .env.example`).toBeTruthy();
      expect(new Set(enCompose), variable).toEqual(new Set([enEjemplo]));
    }
  });
});

describe('docker-compose.yml · valores por defecto', () => {
  it('usa para POSTGRES_DB, CLINICAL_NET_SUBNET y CORPUS_DB_NET_SUBNET los mismos valores por defecto que .env.example, de donde los lee setup-secrets.sh [US-035 AC-4]', () => {
    const compose = readFileSync(COMPOSE, 'utf8');
    const ejemplo = readFileSync(ENV_EXAMPLE, 'utf8');
    for (const variable of ['POSTGRES_DB', 'CLINICAL_NET_SUBNET', 'CORPUS_DB_NET_SUBNET']) {
      const enCompose = [...compose.matchAll(new RegExp(`\\$\\{${variable}:-([^}]*)\\}`, 'g'))].map((coincidencia) => coincidencia[1]);
      const enEjemplo = ejemplo.match(new RegExp(`^${variable}=(.*)$`, 'm'))?.[1];

      expect(enEjemplo, `${variable} en .env.example`).toBeTruthy();
      expect(enCompose.length, `${variable} en el Compose`).toBeGreaterThan(0);
      expect(new Set(enCompose), variable).toEqual(new Set([enEjemplo]));
    }
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

describe('docker-compose.yml · clinical-seed (one-shot de L1D-169)', () => {
  it('las contraseñas del seed solo están en clinical-seed y ningún servicio las declara en environment [US-039 AC-1]', () => {
    const config = resolver();
    const montados = (nombre) => (config.services[nombre].secrets ?? []).map((secreto) => secreto.source);
    const conContrasenaDelSeed = Object.keys(config.services).filter(
      (nombre) => montados(nombre).includes('seed_doctor_password') || montados(nombre).includes('seed_admin_password'),
    );

    expect(conContrasenaDelSeed).toEqual(['clinical-seed']);
    expect(config.services['clinical-seed'].restart).toBe('no');
    expect(config.services['clinical-seed'].environment.SEED_DOCTOR_PASSWORD_FILE).toBe('/run/secrets/seed_doctor_password');
    expect(config.services['clinical-seed'].environment.SEED_ADMIN_PASSWORD_FILE).toBe('/run/secrets/seed_admin_password');
    for (const [nombre, definicion] of Object.entries(config.services)) {
      const variables = Object.keys(definicion.environment ?? {});
      expect(variables.filter((variable) => ['SEED_DOCTOR_PASSWORD', 'SEED_ADMIN_PASSWORD'].includes(variable)), nombre).toEqual([]);
    }
  });

  it('recibe exactamente la contraseña de clinical_api, la CA pública, las dos del seed y las dos claves de la identidad [US-039 AC-1] [US-046 AC-6]', () => {
    const config = resolver();
    expect(() => assertRepartoDeSecretos(config)).not.toThrow();
    expect((config.services['clinical-seed'].secrets ?? []).map((secreto) => secreto.source).sort()).toEqual(
      ['blind_index_hmac_key', 'identity_aes_key', 'pg_ca.crt', 'pg_clinical_api_password', 'seed_admin_password', 'seed_doctor_password'],
    );
  });

  it('falla nombrando clinical-seed y pg_ca.crt cuando un override le quita la CA [US-039 AC-1]', () => {
    const override = 'services:\n  clinical-seed:\n    secrets: !override\n      - pg_clinical_api_password\n      - seed_doctor_password\n      - seed_admin_password\n';
    expect(() => assertRepartoDeSecretos(resolver({ override }))).toThrow(/clinical-seed.*pg_ca\.crt/);
  });

  it('se conecta a PostgreSQL con la URL sin credenciales, la contraseña por archivo y TLS verificado con la CA; ningún servicio lleva DATABASE_URL con contraseña [US-039 AC-1]', () => {
    const config = resolver();
    const entornoDelSeed = config.services['clinical-seed'].environment;

    expect(new URL(entornoDelSeed.CLINICAL_DATABASE_URL).password).toBe('');
    expect(new URL(entornoDelSeed.CLINICAL_DATABASE_URL).username).toBe('clinical_api');
    expect(entornoDelSeed.PG_CLINICAL_API_PASSWORD_FILE).toBe('/run/secrets/pg_clinical_api_password');
    expect(entornoDelSeed.CLINICAL_DATABASE_CA_FILE).toBe('/run/secrets/pg_ca.crt');
    for (const [nombre, definicion] of Object.entries(config.services)) {
      for (const [variable, valor] of Object.entries(definicion.environment ?? {})) {
        if (/DATABASE_URL$/.test(variable)) {
          expect(new URL(String(valor).replace(/^postgresql\+\w+:/, 'postgresql:')).password, `${nombre} ${variable}`).toBe('');
        }
      }
    }
  });

  it('corre sin reinicio, tras postgres healthy, con el uid dueño de los secretos y el catálogo de solo lectura [US-039 AC-1]', () => {
    const seed = resolver({ entorno: { ONCOLENS_UID: '4242', ONCOLENS_GID: '4343' } }).services['clinical-seed'];

    expect(seed.depends_on.postgres.condition).toBe('service_healthy');
    expect(seed.user).toBe('4242:4343');
    expect(Object.keys(seed.networks)).toEqual(['clinical-net']);
    expect(seed.ports ?? []).toEqual([]);
    const catalogo = (seed.volumes ?? []).find((volumen) => /packages\/clinical-catalogs$/.test(volumen.source ?? ''));
    expect(catalogo?.read_only).toBe(true);
    expect(catalogo?.target).toBe(seed.environment.CLINICAL_CATALOG_PATH);
  });

  it('clinical-seed pertenece al perfil seed y no arranca con up sin perfil [US-039 AC-5]', () => {
    const compose = parseYaml(readFileSync(COMPOSE, 'utf8'));
    const sinPerfil = resolver({ entorno: { COMPOSE_PROFILES: '' } });

    expect(compose.services['clinical-seed'].profiles).toEqual(['seed']);
    expect(Object.keys(sinPerfil.services)).not.toContain('clinical-seed');
    expect(Object.keys(resolver().services)).toContain('clinical-seed');
  });

  it('pasa REAL_ANONYMIZED_ENABLED y REAL_IDENTIFIED_ENABLED al seed para que su guarda los vea [US-039 AC-5]', () => {
    const porDefecto = resolver().services['clinical-seed'].environment;
    const habilitado = resolver({ entorno: { REAL_ANONYMIZED_ENABLED: 'true' } }).services['clinical-seed'].environment;

    expect(porDefecto.REAL_ANONYMIZED_ENABLED).toBe('false');
    expect(porDefecto.REAL_IDENTIFIED_ENABLED).toBe('false');
    expect(habilitado.REAL_ANONYMIZED_ENABLED).toBe('true');
  });

  it('exige APP_ENV sin valor por defecto: Compose no levanta clinical-seed sin APP_ENV [US-039 AC-5]', () => {
    const compose = parseYaml(readFileSync(COMPOSE, 'utf8'));

    expect(compose.services['clinical-seed'].environment.APP_ENV).toBe('${APP_ENV:?APP_ENV obligatorio}');
    expect(() => resolver({ entorno: { APP_ENV: '' } })).toThrow(/APP_ENV obligatorio/);
  });

  it('exige APP_ENV en clinical-api sin valor por defecto y le pasa la configuración del gateway de análisis [L1D-103 RN-11 RN-13]', () => {
    const compose = parseYaml(readFileSync(COMPOSE, 'utf8'));
    const entorno = resolver().services['clinical-api'].environment;

    expect(compose.services['clinical-api'].environment.APP_ENV).toBe('${APP_ENV:?APP_ENV obligatorio}');
    expect(() => resolver({ entorno: { APP_ENV: '' } })).toThrow(/APP_ENV obligatorio/);
    expect(entorno.RAG_ORCHESTRATOR_URL).toBe('http://rag-orchestrator:8000');
    expect(entorno.ANALYSIS_MAX_OPTIONS).toBe('');
    expect(entorno.EVIDENCE_DEFAULT_YEARS).toBe('');
    expect(entorno.RAG_TIMEOUT_MS).toBe('');
    expect(entorno.AI_DISCLAIMER_TEXT).toBe('');
    expect(entorno.ANALYSIS_BASIS_S1_ASSUMPTION_TEXT).toBe('');
  });

  it('pasa a clinical-api los tipos habilitados y las claves del corpus con valores de demo y respeta lo que define el llamador [L1D-173 US-043]', () => {
    const porDefecto = resolver().services['clinical-api'].environment;
    const definido = resolver({
      entorno: { ENABLED_CANCER_TYPES: 'mama', CORPUS_CUTOFF_DATE: '2026-10-01' },
    }).services['clinical-api'].environment;

    expect(porDefecto.ENABLED_CANCER_TYPES).toBe('mama,prostata');
    expect(porDefecto.CORPUS_EXCLUDED_SOURCES).toBe('NCCN,ESMO');
    expect(porDefecto.CORPUS_CUTOFF_DATE).toBe('2026-09-30');
    expect(definido.ENABLED_CANCER_TYPES).toBe('mama');
    expect(definido.CORPUS_CUTOFF_DATE).toBe('2026-10-01');
  });

  it('monta config/pii-formats.json de solo lectura en clinical-api y le pasa las rutas de desidentificación [L1D-203 RN-11]', () => {
    const servicio = resolver().services['clinical-api'];
    const formatos = (servicio.volumes ?? []).find((volumen) => /config\/pii-formats\.json$/.test(volumen.source ?? ''));

    expect(servicio.environment.PII_FORMATS_PATH).toBe('/config/pii-formats.json');
    expect(servicio.environment.PII_MASKS_PATH).toBe('/app/apps/clinical-api/config/pii-masks.json');
    expect(servicio.environment.PII_NAME_TOKEN_MIN_LENGTH).toBe('');
    expect(formatos?.target).toBe(servicio.environment.PII_FORMATS_PATH);
    expect(formatos?.read_only).toBe(true);
  });
});
