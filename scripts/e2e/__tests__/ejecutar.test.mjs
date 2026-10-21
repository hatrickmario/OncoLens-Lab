import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// L1D-278 (test después, ARR-02 AC-1): scripts/e2e/ejecutar.sh en modo CI con `docker`, `curl`, `npm` y `npx` falsos en el
// PATH. Así se prueban, sin Docker ni navegador, el aislamiento del proyecto y de los secretos, la espera acotada y la
// limpieza; la ejecución real contra Compose es el propio job `e2e`. `setup-secrets.sh` corre de verdad (solo openssl).
const RAIZ = path.resolve(import.meta.dirname, '../../..');
const SCRIPT = path.join(RAIZ, 'scripts/e2e/ejecutar.sh');

const falso = (cuerpo) => `#!/usr/bin/env bash\n${cuerpo}\n`;
const STUBS = {
  docker: falso(`echo "$COMPOSE_PROJECT_NAME|$ONCOLENS_SECRETS_DIR|$*" >> "$STUB_LOG"
case "$1 $2" in
  "network ls") echo oncolens-e2e_clinical-net ;;
esac
exit 0`),
  curl: falso(`[ "$STUB_WEB" = caido ] && { printf 000; exit 0; }; printf 200`),
  npm: falso('[ "$1 $2" = "run build" ] && [ -n "$STUB_BUILD_FALLA" ] && { echo "error de build simulado"; exit 1; }\nexit 0'),
  npx: falso(`echo "$*|CI=$CI|clave_presente=$([ -n "$E2E_DOC_CONTRASENA" ] && echo si || echo no)" >> "$STUB_LOG.npx"
[ "$1" = playwright ] && [ "$2" = test ] && echo "clave:$E2E_DOC_CONTRASENA" >> "$STUB_LOG.clave"
exit 0`),
  // `mktemp` falso: con STUB_MKTEMP_VACIO termina bien pero sin crear nada (el script debe fallar, no seguir con una ruta vacía).
  mktemp: falso('[ -n "$STUB_MKTEMP_VACIO" ] && exit 0\nexec /usr/bin/mktemp "$@"'),
};

let temporal;
let bin;
let registro;

beforeAll(() => {
  temporal = mkdtempSync(path.join(os.tmpdir(), 'ejecutar-e2e-test-'));
  bin = path.join(temporal, 'bin');
  mkdirSync(bin);
  for (const [nombre, cuerpo] of Object.entries(STUBS)) {
    writeFileSync(path.join(bin, nombre), cuerpo);
    chmodSync(path.join(bin, nombre), 0o755);
  }
});
afterAll(() => rmSync(temporal, { recursive: true, force: true }));
beforeEach(() => {
  registro = path.join(mkdtempSync(path.join(temporal, "caso-")), "registro");
});

function ejecutar(argumentos = [], entorno = {}) {
  return spawnSync('bash', [SCRIPT, ...argumentos], {
    cwd: RAIZ,
    encoding: 'utf8',
    timeout: 120_000,
    env: { PATH: `${bin}:${process.env.PATH}`, HOME: process.env.HOME, STUB_LOG: registro, CI: 'true', ...entorno },
  });
}
const leer = (archivo) => (existsSync(archivo) ? readFileSync(archivo, 'utf8').trim().split('\n') : []);

describe('scripts/e2e/ejecutar.sh en modo CI', () => {
  it('usa su propio proyecto de Compose y su propia carpeta de secretos aunque el entorno defina otros [ARR-02 AC-1]', () => {
    const ajena = path.join(temporal, 'secretos-del-desarrollador');
    mkdirSync(ajena);
    writeFileSync(path.join(ajena, 'centinela'), 'no se toca');

    const resultado = ejecutar([], { COMPOSE_PROJECT_NAME: 'oncolens', ONCOLENS_SECRETS_DIR: ajena });

    expect(resultado.status, resultado.stderr).toBe(0);
    const llamadas = leer(registro).map((linea) => linea.split('|'));
    expect(llamadas.length).toBeGreaterThan(0);
    expect(new Set(llamadas.map(([proyecto]) => proyecto))).toEqual(new Set(['oncolens-e2e']));
    expect(llamadas.filter(([, secretos]) => secretos === ajena)).toEqual([]);
    expect(readFileSync(path.join(ajena, 'centinela'), 'utf8')).toBe('no se toca');
  });

  it('baja el stack con down -v y borra su carpeta de secretos al terminar [ARR-02 AC-1]', () => {
    const resultado = ejecutar();

    expect(resultado.status, resultado.stderr).toBe(0);
    const llamadas = leer(registro).map((linea) => linea.split('|'));
    expect(llamadas.some(([, , comando]) => /down -v/.test(comando))).toBe(true);
    const carpetaDeSecretos = llamadas[0][1];
    expect(carpetaDeSecretos).not.toBe('');
    expect(existsSync(carpetaDeSecretos)).toBe(false);
  });

  it('ejecuta Playwright con CI y con la contraseña generada, sin imprimirla [ARR-02 AC-1]', () => {
    const resultado = ejecutar(['--', '--grep', 'US-061']);

    expect(resultado.status, resultado.stderr).toBe(0);
    const playwright = leer(`${registro}.npx`).filter((linea) => linea.startsWith('playwright test'));
    expect(playwright).toEqual(['playwright test --grep US-061|CI=true|clave_presente=si']);
    const clave = leer(`${registro}.clave`)[0].replace('clave:', '');
    expect(clave.length).toBeGreaterThanOrEqual(16);
    expect(resultado.stdout + resultado.stderr).not.toContain(clave);
  });

  it('rechaza --mantener cuando hay CI [ARR-02 AC-1]', () => {
    const resultado = ejecutar(['--mantener']);

    expect(resultado.status).toBe(2);
    expect(resultado.stderr).toContain('--mantener no se admite en la CI');
    expect(leer(registro)).toEqual([]);
  });

  it('falla nombrando el web tras la espera máxima y no ejecuta Playwright cuando el stack no responde [ARR-02 AC-1]', () => {
    const resultado = ejecutar([], { STUB_WEB: 'caido', E2E_ESPERA_STACK_SEGUNDOS: '1', E2E_ESPERA_INTERVALO_SEGUNDOS: '1' });

    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain('el web no responde en /login tras 1 s');
    expect(leer(`${registro}.npx`).filter((linea) => linea.startsWith('playwright test'))).toEqual([]);
    expect(leer(registro).some((linea) => /down -v/.test(linea))).toBe(true);
  });

  it('muestra la cola del build y no ejecuta Playwright cuando el build de clinical-language falla', () => {
    const resultado = ejecutar([], { STUB_BUILD_FALLA: '1' });

    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain('error de build simulado');
    expect(resultado.stderr).toContain('falló el build de @oncolens/clinical-language');
    expect(leer(`${registro}.npx`).filter((linea) => linea.startsWith('playwright test'))).toEqual([]);
  });

  it('falla sin seguir con una ruta vacía cuando mktemp no crea el directorio', () => {
    const resultado = ejecutar([], { STUB_MKTEMP_VACIO: '1' });

    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain('mktemp -d no creó un directorio');
    expect(leer(registro)).toEqual([]);
  });
});
