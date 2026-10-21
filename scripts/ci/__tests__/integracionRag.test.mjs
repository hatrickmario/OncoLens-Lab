import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claveDelResumen, estadoDeLosAc } from '../verificar-acs-rag.mjs';

// L1D-277 (test después, ARR-01 AC-2 y AC-3): el script corre con un `docker` falso en el PATH que registra cada llamada.
// Así se prueban, sin Docker, el orden, los tiempos de espera, los fallos nombrados y la comprobación de aislamiento;
// la ejecución real contra Compose es el propio job `integration-rag`.
const RAIZ = path.resolve(import.meta.dirname, '../../..');
const SCRIPT = path.join(RAIZ, 'scripts/ci/integracion-rag-orchestrator.sh');
const REQUERIDOS = ['US-058:1', 'US-058:3', 'US-058:4', 'US-059:1', 'US-059:3', 'US-059:4', 'US-059:5'];
const SCRIPT_CLINICAL = path.join(RAIZ, 'scripts/ci/integracion-clinical-api.sh');
const SECRETOS_PERMITIDOS = ['pg_test_admin_password', 'pg_rag_corpus_password', 'pg_rag_corpus_migrator_password'];

const DOCKER_FALSO = `#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
echo "$COMPOSE_PROJECT_NAME" >> "$STUB_LOG.proyecto"
sub=""
for a in "$@"; do case "$a" in config|up|ps|run|build|down) sub="$a"; break ;; esac; done
case "$sub" in
  config) echo '{"services":{"rag-pruebas":{"depends_on":{"milvus-standalone":{},"postgres":{}}}}}' ;;
  up) [ "$STUB_MODO" = milvus_no_sano ] && { echo "container milvus-standalone is unhealthy" >&2; exit 1; }; exit 0 ;;
  ps) if [ "$STUB_MODO" = milvus_no_sano ] && [[ "$*" == *milvus-standalone* ]]; then echo "milvus-standalone unhealthy running"; else echo "x healthy running"; fi ;;
  run)
    if [[ "$*" == *--entrypoint* ]]; then
      [ -n "$STUB_RUTA" ] && { [ -e "$RAG_PRUEBAS_REPO_DIR/$STUB_RUTA" ] && echo si || echo no; } >> "$STUB_LOG.copiado"
      printf '%s\\n' pg_test_admin_password pg_rag_corpus_password pg_rag_corpus_migrator_password
      [ "$STUB_MODO" = secreto_clinico ] && echo identity_aes_key
      printf '%s\\n' --entorno-- PATH HOME
      [ "$STUB_MODO" = env_clinico ] && echo CLINICAL_DATABASE_URL
      printf '%s\\n' --arbol--
      [ -n "$STUB_ARBOL" ] && printf '%s\\n' $STUB_ARBOL
      exit 0
    fi
    echo "pytest simulado"
    resumen='{"US-058 AC-1":["passed"],"US-058 AC-3":["passed"],"US-058 AC-4":["passed"],"US-059 AC-1":["passed"],"US-059 AC-3":["passed"],"US-059 AC-4":["passed"],"US-059 AC-5":["passed"]}'
    [ "$STUB_MODO" = ac_sin_test ] && resumen='{"US-058 AC-1":["passed"]}'
    [ "$STUB_MODO" = ac_fallido ] && resumen='{"US-058 AC-1":["passed"],"US-058 AC-3":["failed"]}'
    echo "$resumen" > "$RAG_PRUEBAS_RESULTADOS_DIR/resumen-ac.json"
    # Pytest en rojo con el resumen completo y en verde: el script debe fallar por el código de salida de Pytest, no por el resumen.
    [ "$STUB_MODO" = pytest_rojo ] && exit 1
    exit 0 ;;
  *) exit 0 ;;
esac
`;

let temporal;

beforeAll(() => {
  temporal = mkdtempSync(path.join(os.tmpdir(), 'integracion-rag-test-'));
  writeFileSync(path.join(temporal, 'docker'), DOCKER_FALSO);
  chmodSync(path.join(temporal, 'docker'), 0o755);
  // `mktemp` falso: con STUB_MKTEMP_VACIO termina bien pero sin crear nada (el script debe fallar, no seguir con una ruta vacía).
  writeFileSync(path.join(temporal, 'mktemp'), '#!/usr/bin/env bash\n[ -n "$STUB_MKTEMP_VACIO" ] && exit 0\nexec /usr/bin/mktemp "$@"\n');
  chmodSync(path.join(temporal, 'mktemp'), 0o755);
  // `npm` falso: el script de clinical-api termina con scripts/test-integration.sh, que correría la suite real.
  writeFileSync(path.join(temporal, 'npm'), '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(path.join(temporal, 'npm'), 0o755);
});
afterAll(() => rmSync(temporal, { recursive: true, force: true }));

const leerLineas = (archivo) => (existsSync(archivo) ? readFileSync(archivo, 'utf8').split('\n').filter(Boolean) : []);

function correr(modo, entorno = {}, script = SCRIPT) {
  const registro = path.join(temporal, `registro-${modo}-${Object.keys(entorno).join('')}.log`);
  rmSync(registro, { force: true });
  rmSync(`${registro}.proyecto`, { force: true });
  rmSync(`${registro}.copiado`, { force: true });
  const resultado = spawnSync('bash', [script], {
    cwd: RAIZ,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${temporal}:${process.env.PATH}`,
      STUB_LOG: registro,
      STUB_MODO: modo,
      ...entorno,
    },
  });
  const proyectos = leerLineas(`${registro}.proyecto`);
  const copiado = leerLineas(`${registro}.copiado`);
  const llamadas = existsSync(registro) ? readFileSync(registro, 'utf8').split('\n').filter(Boolean) : [];
  return { codigo: resultado.status, salida: `${resultado.stdout}${resultado.stderr}`, llamadas, proyectos, copiado };
}
const ejecutoPytest = (llamadas) => llamadas.some((llamada) => /\brun\b/.test(llamada) && !llamada.includes('--entrypoint'));

describe('integracion-rag-orchestrator.sh', () => {
  it('termina en verde y levanta solo lo que declara el Compose de test, con espera explícita y sin pasar flags de publicación [ARR-01 AC-2]', () => {
    const { codigo, salida, llamadas } = correr('ok', { INTEGRACION_RAG_ESPERA_SEGUNDOS: '77' });

    expect(salida).toContain('integracion-rag: OK');
    expect(codigo).toBe(0);
    const levantar = llamadas.find((llamada) => /\bup\b/.test(llamada));
    expect(levantar).toMatch(/--wait --wait-timeout 77 .*milvus-standalone postgres$/);
    expect(llamadas.filter((llamada) => /(^| )(-p|--publish)( |$)/.test(llamada))).toEqual([]);
    expect(llamadas.at(-1)).toMatch(/\bdown -v\b/);
  });

  it('falla nombrando milvus-standalone y no ejecuta Pytest cuando Milvus no queda sano [ARR-01 AC-2]', () => {
    const { codigo, salida, llamadas } = correr('milvus_no_sano');

    expect(codigo).not.toBe(0);
    expect(salida).toMatch(/milvus-standalone unhealthy/);
    expect(salida).toMatch(/no quedaron sanos/);
    expect(ejecutoPytest(llamadas)).toBe(false);
    expect(llamadas.at(-1)).toMatch(/\bdown -v\b/);
  });

  it('falla antes de Pytest cuando el contenedor monta un secreto fuera de los de rag_corpus [ARR-01 AC-2, RN-10]', () => {
    const { codigo, salida, llamadas } = correr('secreto_clinico');

    expect(codigo).not.toBe(0);
    expect(salida).toMatch(/monta secretos distintos de los permitidos.*identity_aes_key/);
    expect(ejecutoPytest(llamadas)).toBe(false);
  });

  it('falla antes de Pytest cuando el contenedor tiene variables de entorno clínicas [ARR-01 AC-2, RN-10]', () => {
    const { codigo, salida, llamadas } = correr('env_clinico');

    expect(codigo).not.toBe(0);
    expect(salida).toMatch(/variables de entorno clínicas.*CLINICAL_DATABASE_URL/);
    expect(ejecutoPytest(llamadas)).toBe(false);
  });

  it('falla por el código de Pytest, sin reintentarlo, aunque el resumen por AC esté completo y en verde [ARR-01 AC-2]', () => {
    const { codigo, salida, llamadas } = correr('pytest_rojo');

    expect(codigo).not.toBe(0);
    expect(salida).not.toContain('no dejó el resumen');
    expect(salida).toMatch(/falló \(código 1\)/);
    expect(llamadas.filter((llamada) => /\brun\b/.test(llamada) && !llamada.includes('--entrypoint'))).toHaveLength(1);
  });

  it('falla nombrando el AC cuando un AC requerido no tiene test ejecutado [ARR-01 AC-3]', () => {
    const { codigo, salida } = correr('ac_sin_test');

    expect(codigo).not.toBe(0);
    expect(salida).toMatch(/US-058 AC-3 no está en verde: sin_test/);
  });

  it('falla nombrando el AC cuando uno de sus tests no pasó [ARR-01 AC-3]', () => {
    const { codigo, salida } = correr('ac_fallido');

    expect(codigo).not.toBe(0);
    expect(salida).toMatch(/US-058 AC-3 no está en verde: no_verde/);
  });

  it.each([
    ['clave privada .pem', 'ruta/jwt.pem'],
    ['archivo .key', 'ruta/tls.key'],
    ['certificado .crt', 'ruta/tls.crt'],
    ['archivo *_password', 'ruta/pg_clinical_password'],
    ['archivo *_key', 'ruta/identity_aes_key'],
    ['pg_hba*', 'ruta/pg_hba.conf'],
    ['.env', 'ruta/.env.local'],
    ['directorio secrets', 'ruta/secrets'],
  ])('falla antes de Pytest nombrando el archivo cuando el árbol del contenedor trae %s [ARR-01 AC-2, RN-14]', (_nombre, archivo) => {
    const { codigo, salida, llamadas } = correr('arbol_con_secreto', { STUB_ARBOL: archivo });

    expect(codigo).not.toBe(0);
    expect(salida).toContain(`contiene secretos o .env: ${archivo}`);
    expect(ejecutoPytest(llamadas)).toBe(false);
  });

  it('busca en el árbol del contenedor todos los nombres de secreto, sin recorrer node_modules [ARR-01 AC-2, RN-14]', () => {
    const { llamadas } = correr('ok');

    const inspeccion = llamadas.find((llamada) => llamada.includes('--entrypoint'));
    for (const patron of ['*.pem', '*.key', '*.crt', '*_password', '*_key', 'pg_hba*', '.env*', 'secrets']) {
      expect([`-name "${patron}"`, `-name ${patron} `].some((fragmento) => inspeccion.includes(fragmento))).toBe(true);
    }
    expect(inspeccion).toContain('-path /repo/node_modules -prune');
  });

  it('falla sin crear nada cuando mktemp no devuelve un directorio [ARR-01 AC-2]', () => {
    const { codigo, salida, llamadas } = correr('ok', { STUB_MKTEMP_VACIO: '1' });

    expect(codigo).not.toBe(0);
    expect(salida).toContain('mktemp -d no creó un directorio');
    expect(llamadas.filter((llamada) => /\bup\b/.test(llamada))).toEqual([]);
  });

  it('no copia un archivo sin versionar de las rutas que leen los tests y lo nombra en el aviso [ARR-01 AC-2, RN-14]', () => {
    const ruta = 'apps/rag-orchestrator/tests/zz_sin_versionar_prueba.txt';
    const absoluta = path.join(RAIZ, ruta);
    writeFileSync(absoluta, 'dato local no versionado');
    try {
      const { codigo, salida, copiado } = correr('ok', { STUB_RUTA: ruta });

      expect(codigo).toBe(0);
      expect(copiado).toEqual(['no']);
      expect(salida).toContain(`NO se copian al contenedor: ${ruta}`);
    } finally {
      rmSync(absoluta, { force: true });
    }
  });

  it('tolera .env.example en el árbol del contenedor [ARR-01 AC-2]', () => {
    const { codigo } = correr('arbol_con_ejemplo', { STUB_ARBOL: 'ruta/.env.example' });

    expect(codigo).toBe(0);
  });

  it('no borra un ONCOLENS_SECRETS_DIR ajeno ni usa el proyecto de Compose del entorno [ARR-01 AC-2]', () => {
    const ajeno = mkdtempSync(path.join(temporal, 'secretos-ajenos-'));
    writeFileSync(path.join(ajeno, 'marca'), 'no tocar');
    const entorno = { ONCOLENS_SECRETS_DIR: ajeno, COMPOSE_PROJECT_NAME: 'proyecto-ajeno' };

    const { codigo, proyectos } = correr('ok', entorno);

    expect(codigo).toBe(0);
    expect(readFileSync(path.join(ajeno, 'marca'), 'utf8')).toBe('no tocar');
    expect(new Set(proyectos)).toEqual(new Set(['oncolens-ci-rag']));
  });

  it('declara como permitidos exactamente los tres secretos del arnés de corpus [ARR-01 AC-2, RN-10]', () => {
    const [, lista] = readFileSync(SCRIPT, 'utf8').match(/SECRETOS_DEL_CONTENEDOR_DE_PRUEBAS=\(([^)]*)\)/);
    expect(lista.trim().split(/\s+/).sort()).toEqual([...SECRETOS_PERMITIDOS].sort());
  });
});

describe('integracion-clinical-api.sh', () => {
  it('usa siempre su propio proyecto de Compose y nunca el del entorno (su down -v no alcanza el stack local) [ARR-01 AC-2]', () => {
    const { codigo, proyectos } = correr('ok', { COMPOSE_PROJECT_NAME: 'proyecto-ajeno' }, SCRIPT_CLINICAL);

    expect(codigo).toBe(0);
    expect(proyectos.length).toBeGreaterThan(1);
    expect(new Set(proyectos)).toEqual(new Set(['oncolens-ci-clinical']));
  });

  it('falla sin crear nada cuando mktemp no devuelve un directorio [ARR-01 AC-2]', () => {
    const { codigo, salida, llamadas } = correr('ok', { STUB_MKTEMP_VACIO: '1' }, SCRIPT_CLINICAL);

    expect(codigo).not.toBe(0);
    expect(salida).toContain('mktemp -d no creó un directorio');
    expect(llamadas.filter((llamada) => /\bup\b/.test(llamada))).toEqual([]);
  });

  it('no borra un ONCOLENS_SECRETS_DIR ajeno del entorno al terminar [ARR-01 AC-2]', () => {
    const ajeno = mkdtempSync(path.join(temporal, 'secretos-ajenos-clinical-'));
    mkdirSync(path.join(ajeno, 'sub'));
    writeFileSync(path.join(ajeno, 'sub', 'marca'), 'no tocar');

    const { codigo } = correr('ok', { ONCOLENS_SECRETS_DIR: ajeno }, SCRIPT_CLINICAL);

    expect(codigo).toBe(0);
    expect(readFileSync(path.join(ajeno, 'sub', 'marca'), 'utf8')).toBe('no tocar');
  });
});

describe('verificar-acs-rag.mjs', () => {
  const requeridos = ['US-058:1', 'US-059:5'];

  it('traduce la forma US-xxx:n a la clave del resumen [ARR-01 AC-3]', () => {
    expect(claveDelResumen('US-059:5')).toBe('US-059 AC-5');
  });

  it('marca verde cuando todos los tests del AC pasaron [ARR-01 AC-3]', () => {
    const resumen = { 'US-058 AC-1': ['passed', 'passed'], 'US-059 AC-5': ['passed'] };
    expect(estadoDeLosAc(resumen, requeridos).map(({ estado }) => estado)).toEqual(['verde', 'verde']);
  });

  it('distingue el AC sin test del AC con un test que no pasó [ARR-01 AC-3]', () => {
    const resumen = { 'US-058 AC-1': ['passed', 'failed'] };
    expect(estadoDeLosAc(resumen, requeridos).map(({ estado }) => estado)).toEqual(['no_verde', 'sin_test']);
  });

  it('REQUERIDOS del test coincide con los siete AC sin ejecución del script [ARR-01 AC-3]', () => {
    const [, lista] = readFileSync(SCRIPT, 'utf8').match(/ACS_REQUERIDOS=\(([^)]*)\)/);
    expect(lista.trim().split(/\s+/)).toEqual(REQUERIDOS);
  });
});
