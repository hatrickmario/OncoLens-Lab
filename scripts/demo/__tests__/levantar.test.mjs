import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Humos de los scripts de la demo (L1D-297, test después): sin Docker real. `docker` es un stub en el PATH que registra cada
 * llamada, así se comprueba lo que el script hace (y lo que NO hace) con estado previo.
 */
const RAIZ = path.resolve(import.meta.dirname, '../../..');
const LEVANTAR = path.join(RAIZ, 'scripts/demo/levantar.sh');
const VERIFICAR = path.join(RAIZ, 'scripts/demo/verificar-conteos.py');
const PLAZO_MS = 30_000;

const temporales = [];
afterEach(() => {
  for (const dir of temporales.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function stubDeDocker({ volumenes = '', contenedores = '' } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'levantar-'));
  temporales.push(dir);
  const registro = path.join(dir, 'llamadas.log');
  const stub = `#!/bin/sh
echo "docker $*" >> "${registro}"
case "$1" in
  info) exit 0 ;;
  volume) [ "$2" = "ls" ] && printf '%s' "${volumenes}" ;;
  ps) printf '%s' "${contenedores}" ;;
esac
exit 0
`;
  writeFileSync(path.join(dir, 'docker'), stub);
  chmodSync(path.join(dir, 'docker'), 0o755);
  return { dir, registro };
}

function ejecutarLevantar(stub, argumentos = [], entorno = {}) {
  const resultado = spawnSync('bash', [LEVANTAR, ...argumentos], {
    encoding: 'utf8',
    timeout: PLAZO_MS,
    stdin: 'ignore',
    env: {
      PATH: `${stub.dir}:/usr/bin:/bin`,
      HOME: stub.dir,
      COMPOSE_PROJECT_NAME: 'oncolens',
      ...entorno,
    },
  });
  return { codigo: resultado.status, salida: `${resultado.stdout}${resultado.stderr}` };
}

describe('levantar.sh · estado previo (F-07) [US-247 AC-7]', () => {
  it('avisa con la lista, no borra nada y sale distinto de 0 con la orden de apagar.sh cuando hay volúmenes previos y no se confirma', () => {
    const stub = stubDeDocker({ volumenes: 'oncolens_postgres-data\noncolens_milvus-data\n' });

    const { codigo, salida } = ejecutarLevantar(stub);

    expect(codigo).not.toBe(0);
    expect(salida).toContain('oncolens_postgres-data');
    expect(salida).toContain('oncolens_milvus-data');
    expect(salida).toContain('apagar.sh --borrar-datos');
    const llamadas = readFileSync(stub.registro, 'utf8');
    expect(llamadas).not.toMatch(/\b(rm|down|prune)\b/);
    expect(llamadas).not.toContain('compose');
  });

  it('avisa también por contenedores previos aunque no haya volúmenes', () => {
    const stub = stubDeDocker({ contenedores: 'oncolens-postgres-1\n' });

    const { codigo, salida } = ejecutarLevantar(stub);

    expect(codigo).not.toBe(0);
    expect(salida).toContain('oncolens-postgres-1');
  });

  it('pasa del aviso a los requisitos cuando se confirma con --continuar', () => {
    const stub = stubDeDocker({ volumenes: 'oncolens_postgres-data\n' });

    const { salida } = ejecutarLevantar(stub, ['--continuar']);

    expect(salida).toContain('== Requisitos');
  });
});

describe('levantar.sh · verificación del seed [US-247 AC-6]', () => {
  const texto = readFileSync(LEVANTAR, 'utf8');
  const tramo = texto
    .split('# --- verificacion-del-seed ---')[1]
    .split('# --- fin-verificacion-del-seed ---')[0];

  it('reconstruye la imagen del perfil seed antes de sembrar', () => {
    const construir = texto.indexOf('--profile seed build clinical-seed');
    const sembrar = texto.indexOf('--profile seed run --rm clinical-seed');

    expect(construir).toBeGreaterThan(-1);
    expect(construir).toBeLessThan(sembrar);
  });

  it('cuenta con el rol de cada servicio dentro de su contenedor y nunca con un superusuario, psql ni la cadena de conexión', () => {
    expect(tramo).toContain('exec -T clinical-api');
    expect(tramo).toContain('exec -T rag-orchestrator');
    expect(tramo).not.toMatch(
      /psql|postgres -U|-U postgres|superuser|_URL|PASSWORD|printenv|\benv\b|set -x/i,
    );
    expect(tramo).toContain('set +x');
  });

  it('no pasa la contraseña de clinical_api en los argumentos de docker run', () => {
    expect(texto).toContain('--env-file "$archivo_env"');
    expect(texto).not.toMatch(/-e DATABASE_URL=/);
  });
});

describe('verificar-conteos.py · [US-247 AC-6]', () => {
  const semilla = { 'clinical.patient': 5, 'identity.patient_identity': 5, 'auth."user"': 2 };

  function verificar({ clinico, corpus, publicado = semilla }) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'conteos-'));
    temporales.push(dir);
    writeFileSync(path.join(dir, 'seed.json'), JSON.stringify(publicado));
    writeFileSync(
      path.join(dir, 'pob.json'),
      JSON.stringify({ documentos: { a: {}, b: {}, c: {} } }),
    );
    const resultado = spawnSync(
      'python3',
      [
        VERIFICAR,
        '--seed',
        path.join(dir, 'seed.json'),
        '--clinico',
        JSON.stringify({ conteos: clinico }),
        '--corpus',
        JSON.stringify({ conteos: corpus }),
        '--documentos',
        '10',
        '--poblacion',
        path.join(dir, 'pob.json'),
      ],
      { encoding: 'utf8', timeout: PLAZO_MS },
    );
    return { codigo: resultado.status, salida: `${resultado.stdout}${resultado.stderr}` };
  }
  const corpusOk = { documentos_vigentes: 10, con_poblacion_verificada: 3 };

  it('termina con código 0 y publica esperado y obtenido cuando los conteos coinciden con los del seed', () => {
    const { codigo, salida } = verificar({ clinico: semilla, corpus: corpusOk });

    expect(codigo).toBe(0);
    expect(salida).toContain('clinical.patient: esperado=5 obtenido=5');
  });

  it('acepta la re-ejecución idempotente del seed que no republica los usuarios cuando hay usuarios', () => {
    const { codigo } = verificar({
      clinico: semilla,
      corpus: corpusOk,
      publicado: { 'clinical.patient': 5 },
    });

    expect(codigo).toBe(0);
  });

  it('acepta más documentos con población verificada que los del archivo versionado cuando la ingesta completa los dejó', () => {
    const { codigo } = verificar({
      clinico: semilla,
      corpus: { documentos_vigentes: 10, con_poblacion_verificada: 10 },
    });

    expect(codigo).toBe(0);
  });

  it('termina distinto de 0 y nombra identity.patient_identity cuando el seed deja 5 pacientes y 0 identidades', () => {
    const { codigo, salida } = verificar({
      clinico: { ...semilla, 'identity.patient_identity': 0 },
      corpus: corpusOk,
    });

    expect(codigo).not.toBe(0);
    expect(salida).toContain('FALLA identity.patient_identity: esperado 5, obtenido 0');
  });

  it('nombra los documentos del corpus cuando faltan metadatos de población cargados', () => {
    const { codigo, salida } = verificar({
      clinico: semilla,
      corpus: { documentos_vigentes: 10, con_poblacion_verificada: 0 },
    });

    expect(codigo).not.toBe(0);
    expect(salida).toContain('FALLA corpus.con_poblacion_verificada');
  });
});

describe('apagar.sh · [US-247 tareas de instalación] [OUT-05]', () => {
  it('cierra attu al apagar aunque no se haya borrado nada', () => {
    const stub = stubDeDocker();

    spawnSync('bash', [path.join(RAIZ, 'scripts/demo/apagar.sh')], {
      encoding: 'utf8',
      timeout: PLAZO_MS,
      env: { PATH: `${stub.dir}:/usr/bin:/bin`, HOME: stub.dir, TMPDIR: stub.dir },
    });

    expect(readFileSync(stub.registro, 'utf8')).toContain('docker rm -f attu');
  });
});
