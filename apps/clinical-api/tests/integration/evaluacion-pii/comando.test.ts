import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarCorpusPiiMini } from '../../../src/evaluacion/pii/corpus.js';
import type { InformeDePii } from '../../../src/evaluacion/pii/medir-detector.js';

const RAIZ_CLINICAL_API = path.resolve(import.meta.dirname, '../../..');
const RAIZ_REPO = path.resolve(RAIZ_CLINICAL_API, '../..');
const TIEMPO_MAXIMO_DEL_COMANDO_MS = 60_000;
/** Misma fuente que el comando: `tipos_directos` del manifiesto del dataset. */
const TIPOS_DIRECTOS = (
  JSON.parse(readFileSync(path.join(RAIZ_REPO, 'data/eval/pii-mini/manifest.json'), 'utf8')) as {
    tipos_directos: string[];
  }
).tipos_directos;
const execFileAsync = promisify(execFile);

interface Resultado {
  codigo: number;
  stdout: string;
  stderr: string;
}

/** Proceso real: el mismo punto de entrada que `npm run eval:pii`, con tiempo máximo explícito. */
async function correrComando(
  argumentos: string[],
  entorno: Record<string, string> = {},
): Promise<Resultado> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', 'src/cli/medir-pii.ts', ...argumentos],
      {
        cwd: RAIZ_CLINICAL_API,
        env: { ...process.env, ...entorno },
        timeout: TIEMPO_MAXIMO_DEL_COMANDO_MS,
        encoding: 'utf8',
      },
    );
    return { codigo: 0, stdout, stderr };
  } catch (error) {
    const fallo = error as { code?: number; stdout?: string; stderr?: string };
    return { codigo: fallo.code ?? -1, stdout: fallo.stdout ?? '', stderr: fallo.stderr ?? '' };
  }
}

describe('npm run eval:pii', () => {
  let directorio: string;

  beforeAll(() => {
    directorio = mkdtempSync(path.join(tmpdir(), 'eval-pii-'));
  });
  afterAll(() => {
    rmSync(directorio, { recursive: true, force: true });
  });

  it(
    'escribe agregados por tipo, falsos positivos clínicos y p95 sin ningún valor sembrado cuando mide pii-mini [US-013 AC-1]',
    async () => {
      const salida = path.join(directorio, 'informe.json');

      const resultado = await correrComando(['--salida', salida, '--corridas', '1']);

      expect(resultado.codigo).toBe(0);
      const crudo = readFileSync(salida, 'utf8');
      const informe = JSON.parse(crudo) as InformeDePii;
      expect(informe.textos).toBe(300);
      for (const modo of Object.values(informe.modos)) {
        expect(Object.keys(modo.sensibilidadDocumentos).sort()).toEqual(
          [...TIPOS_DIRECTOS, 'total'].sort(),
        );
        expect(modo.falsosPositivosClinicos.controles).toBeGreaterThan(0);
        expect(modo.latenciaP95Ms).toBeGreaterThan(0);
      }
      // RN-10/RN-14: ni el informe ni la salida contienen un solo valor de PII sembrada.
      const corpus = await cargarCorpusPiiMini({
        raizDelRepo: RAIZ_REPO,
        python: 'python3',
        rutaDeBinarios: process.env['PATH'] ?? '',
      });
      const salidaVisible = `${crudo}${resultado.stdout}${resultado.stderr}`;
      const valores = corpus.textos.flatMap((t) =>
        t.etiquetas.map((e) => t.texto.slice(e.inicio, e.fin)),
      );
      expect(valores.length).toBeGreaterThan(900);
      expect(valores.filter((valor) => salidaVisible.includes(valor)).length).toBe(0);
    },
    TIEMPO_MAXIMO_DEL_COMANDO_MS,
  );

  it(
    'termina con código 1 y nombra solo la variable cuando el archivo de formatos no existe',
    async () => {
      const resultado = await correrComando(['--salida', path.join(directorio, 'x.json')], {
        PII_FORMATS_PATH: path.join(directorio, 'no-existe-secreto.json'),
      });

      expect(resultado.codigo).toBe(1);
      expect(resultado.stderr).toContain('PII_FORMATS_PATH');
      expect(resultado.stderr).not.toContain('no-existe-secreto');
    },
    TIEMPO_MAXIMO_DEL_COMANDO_MS,
  );

  it(
    'termina con código 2 y muestra el uso cuando un argumento es inválido',
    async () => {
      const resultado = await correrComando(['--corridas', 'muchas']);

      expect(resultado.codigo).toBe(2);
      expect(resultado.stderr).toContain('uso: eval:pii');
    },
    TIEMPO_MAXIMO_DEL_COMANDO_MS,
  );

  it(
    'termina con código 1 sin volcar el corpus cuando las huellas de pii-mini no coinciden',
    async () => {
      const falso = path.join(directorio, 'python-falso.sh');
      writeFileSync(falso, '#!/bin/sh\nexit 3\n', { mode: 0o755 });

      const resultado = await correrComando(['--salida', path.join(directorio, 'y.json')], {
        PII_EVAL_PYTHON: falso,
      });

      expect(resultado.codigo).toBe(1);
      expect(resultado.stderr).toContain('las huellas no coinciden');
    },
    TIEMPO_MAXIMO_DEL_COMANDO_MS,
  );

  it(
    'no hereda el entorno del proceso padre cuando lanza el generador de Python',
    async () => {
      const envoltorio = path.join(directorio, 'python-envoltorio.sh');
      writeFileSync(
        envoltorio,
        '#!/bin/sh\n[ -z "$SECRETO_DE_PRUEBA" ] || exit 4\nexec python3 "$@"\n',
        { mode: 0o755 },
      );

      const resultado = await correrComando(['--salida', path.join(directorio, 'z.json')], {
        PII_EVAL_PYTHON: envoltorio,
        SECRETO_DE_PRUEBA: 'valor-que-no-debe-llegar',
      });

      expect(resultado.stderr).toBe('');
      expect(resultado.codigo).toBe(0);
    },
    TIEMPO_MAXIMO_DEL_COMANDO_MS,
  );
});
