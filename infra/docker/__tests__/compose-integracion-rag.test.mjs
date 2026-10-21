import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COMPOSE_TEST, RAIZ, crearResolutor } from './lib/compose-resuelto.mjs';
import { archivosDeSecretos, assertSoloWebPublicaPuertos, entorno, servicio } from './lib/reglas-compose.mjs';

// L1D-277 (test después, ARR-01 AC-2, design D1/D1b): el perfil `integracion-rag` del Compose de test.
const SERVICIO = 'rag-pruebas';
const PERFIL = 'integracion-rag';
const SCRIPT = path.join(RAIZ, 'scripts/ci/integracion-rag-orchestrator.sh');
const CLINICAL = /clinical|identity|blind_index|aes|hmac|jwt_service_private|minio|seed_|pg_superuser|pg_research/i;

let resolver;
let limpiar;

beforeAll(() => {
  ({ resolver, limpiar } = crearResolutor());
});
afterAll(() => limpiar());

const conPerfil = () => resolver({ archivosExtra: [COMPOSE_TEST], entorno: { COMPOSE_PROFILES: PERFIL } });
const secretosPermitidos = () => {
  const [, lista] = readFileSync(SCRIPT, 'utf8').match(/SECRETOS_DEL_CONTENEDOR_DE_PRUEBAS=\(([^)]*)\)/);
  return lista.trim().split(/\s+/).sort();
};

describe('docker-compose.test.yml · perfil integracion-rag', () => {
  it('no arranca con `up` sin el perfil: el servicio de Pytest no existe en el Compose resuelto [ARR-01 AC-2]', () => {
    const config = resolver({ archivosExtra: [COMPOSE_TEST], entorno: { COMPOSE_PROFILES: '' } });
    expect(config.services[SERVICIO]).toBeUndefined();
  });

  it('no publica ningún puerto al host con el perfil activo: solo web [ARR-01 AC-2]', () => {
    expect(() => assertSoloWebPublicaPuertos(conPerfil())).not.toThrow();
  });

  it('falla nombrando rag-pruebas cuando un override le publica un puerto [ARR-01 AC-2]', () => {
    const config = resolver({
      archivosExtra: [COMPOSE_TEST],
      entorno: { COMPOSE_PROFILES: PERFIL },
      override: `services:\n  ${SERVICIO}:\n    ports:\n      - "5432:5432"\n`,
    });
    expect(() => assertSoloWebPublicaPuertos(config)).toThrow(new RegExp(SERVICIO));
  });

  it('une el contenedor de Pytest solo a corpus-db-net y ai-net, nunca a clinical-net [ARR-01 AC-2]', () => {
    expect(Object.keys(servicio(conPerfil(), SERVICIO).networks).sort()).toEqual(['ai-net', 'corpus-db-net']);
  });

  it('monta exactamente los secretos que declara el script y ninguno clínico [ARR-01 AC-2, RN-10]', () => {
    const config = conPerfil();
    const montados = archivosDeSecretos(config, servicio(config, SERVICIO)).sort();
    expect(montados).toEqual(secretosPermitidos());
    expect(montados.filter((nombre) => CLINICAL.test(nombre))).toEqual([]);
  });

  it('no recibe variables de entorno ni montajes clínicos y solo escribe en /resultados [ARR-01 AC-2, RN-10]', () => {
    const definicion = servicio(conPerfil(), SERVICIO);
    expect(Object.keys(entorno(definicion)).filter((clave) => CLINICAL.test(clave))).toEqual([]);
    expect(definicion.volumes.map(({ target }) => target).sort()).toEqual(['/repo', '/repo/node_modules', '/resultados']);
    expect(definicion.volumes.filter(({ target, read_only: soloLectura }) => !soloLectura && target !== '/resultados')).toEqual([]);
    expect(definicion.read_only).toBe(true);
  });

  it('depende solo de postgres y milvus-standalone, sin clinical-minio ni servicios de aplicación [ARR-01 AC-2]', () => {
    expect(Object.keys(servicio(conPerfil(), SERVICIO).depends_on).sort()).toEqual(['milvus-standalone', 'postgres']);
  });

  it('construye el target `pruebas` y deja `runtime` como último stage, el de producción [ARR-01 AC-2]', () => {
    const dockerfile = readFileSync(path.join(RAIZ, 'apps/rag-orchestrator/Dockerfile'), 'utf8');
    const etapas = [...dockerfile.matchAll(/^FROM .* AS (\S+)$/gm)].map(([, nombre]) => nombre);
    expect(servicio(conPerfil(), SERVICIO).build.target).toBe('pruebas');
    expect(etapas.at(-1)).toBe('runtime');
    expect(etapas).toContain('pruebas');
  });

  it('el job solo recoge tests/integration, y ahí viven todos los servicios_reales (nadie más los ejecuta) [ARR-01 AC-2]', () => {
    expect(servicio(conPerfil(), SERVICIO).command).toContain('tests/integration');
    const fuera = execFileSync('grep', ['-rl', 'servicios_reales', 'apps/rag-orchestrator/tests', '--include=*.py'], { cwd: RAIZ, encoding: 'utf8' })
      .split('\n')
      .filter((archivo) => archivo && !archivo.startsWith('apps/rag-orchestrator/tests/integration/'));
    expect(fuera).toEqual([]);
  });
});
