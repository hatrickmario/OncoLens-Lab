import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { detectar, lineasCambiadas, tocaDisparador } from '../eval-trigger.mjs';

const REGLAS = YAML.parse(readFileSync(path.resolve(import.meta.dirname, '../eval-trigger-paths.yaml'), 'utf8'));

const cambio = (ruta, ...lineas) => ({ ruta, lineas });

describe('tocaDisparador', () => {
  it('dispara cuando el diff modifica un prompt de rag-orchestrator [US-074 AC-1]', () => {
    const resultado = tocaDisparador([cambio('apps/rag-orchestrator/app/prompts/rag_query.py', '+PROMPT = "v2"')], REGLAS);

    expect(resultado.dispara).toBe(true);
    expect(resultado.motivos).toEqual([{ ruta: 'apps/rag-orchestrator/app/prompts/rag_query.py', motivo: 'ruta' }]);
  });

  it('dispara cuando el diff modifica un catálogo clínico [US-074 AC-2]', () => {
    expect(tocaDisparador([cambio('packages/clinical-catalogs/mama/codigos.json')], REGLAS).dispara).toBe(true);
  });

  it.each([
    ['RELEVANCE_THRESHOLD', '+RELEVANCE_THRESHOLD=0.35'],
    ['LLM_MODEL', '-LLM_MODEL=gemma4:26b'],
  ])('dispara cuando el diff de .env.example cambia %s [US-074 AC-3]', (_clave, linea) => {
    const resultado = tocaDisparador([cambio('infra/docker/.env.example', linea)], REGLAS);

    expect(resultado.dispara).toBe(true);
    expect(resultado.motivos[0].motivo).toBe('clave');
  });

  it('dispara cuando cambia una clave de modelo en la configuración versionada en minúsculas [US-074 AC-3]', () => {
    expect(tocaDisparador([cambio('apps/rag-orchestrator/app/config/settings.py', '+    llm_model: str = "x"')], REGLAS).dispara).toBe(true);
  });

  it('dispara cuando cambia el manifiesto del corpus de data/raw [US-074 AC-3]', () => {
    expect(tocaDisparador([cambio('data/raw/seed/manifest.yaml')], REGLAS).dispara).toBe(true);
  });

  it('no dispara cuando el diff solo toca apps/web [US-074 AC-1]', () => {
    const resultado = tocaDisparador([cambio('apps/web/app/login/page.tsx', '+<h1>Entrar</h1>')], REGLAS);

    expect(resultado).toEqual({ dispara: false, motivos: [] });
  });

  it('no dispara cuando el diff de .env.example cambia una clave ajena a la IA [US-074 AC-3]', () => {
    expect(tocaDisparador([cambio('infra/docker/.env.example', '+POSTGRES_PORT=5433')], REGLAS).dispara).toBe(false);
  });

  it('no confunde una clave con otra que la contiene como prefijo [US-074 AC-3]', () => {
    expect(tocaDisparador([cambio('infra/docker/.env.example', '+LLM_MODEL_FALLBACK_DISABLED=true')], REGLAS).dispara).toBe(false);
  });

  it('no dispara cuando el diff está vacío [US-074 AC-1]', () => {
    expect(tocaDisparador([], REGLAS)).toEqual({ dispara: false, motivos: [] });
  });

  it('dispara cuando cambia MODEL_QUANTIZATION [US-074 AC-3]', () => {
    expect(tocaDisparador([cambio('infra/docker/.env.example', '+MODEL_QUANTIZATION=int8')], REGLAS).dispara).toBe(true);
  });
});

describe('claves de las reglas frente a la configuración de rag-orchestrator', () => {
  const fuente = readFileSync(path.resolve(import.meta.dirname, '../../../apps/rag-orchestrator/app/config/modelos.py'), 'utf8');
  const claves = (nombre) => [...fuente.match(new RegExp(`${nombre} = \\(([^)]*)\\)`))[1].matchAll(/"([A-Z_0-9]+)"/g)].map((m) => m[1]);
  // Rutas locales de cachés: no cambian modelo, prompt, umbral, catálogo ni corpus.
  const EXENTAS = ['MODEL_CACHE_DIR', 'DATA_CACHE_DIR'];

  it('dispara con toda clave de modelos, chunking e índice salvo las exentas [US-074 AC-3]', () => {
    const todas = [...claves('CLAVES_MODELOS'), ...claves('CLAVES_CHUNKING_E_INDICE')].filter((c) => !EXENTAS.includes(c));

    expect(todas.length).toBeGreaterThan(10);
    expect(todas.filter((c) => !tocaDisparador([cambio('infra/docker/.env.example', `+${c}=x`)], REGLAS).dispara)).toEqual([]);
  });
});

describe('lineasCambiadas', () => {
  it('conserva una línea borrada que empieza por -- y descarta las cabeceras del diff [US-074 AC-3]', () => {
    const diff = ['diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -1,2 +1 @@', '--- LLM_MODEL=a', '+LLM_MODEL=b', ''].join('\n');

    expect(lineasCambiadas(diff)).toEqual(['-- LLM_MODEL=a', 'LLM_MODEL=b']);
  });
});

describe('detectar', () => {
  /** Repositorio temporal con dos commits: no depende del historial ni de la profundidad del checkout. */
  const carpetas = [];
  afterAll(() => carpetas.forEach((carpeta) => rmSync(carpeta, { recursive: true, force: true })));
  const repositorio = () => {
    const raiz = mkdtempSync(path.join(os.tmpdir(), 'oncolens-detectar-'));
    carpetas.push(raiz);
    const git = (...parametros) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', '-C', raiz, ...parametros], { encoding: 'utf8' });
    git('init', '-q');
    writeFileSync(path.join(raiz, 'a.txt'), 'uno\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    const base = git('rev-parse', 'HEAD').trim();
    writeFileSync(path.join(raiz, 'a.txt'), 'dos\n');
    git('commit', '-q', '-am', 'cambio');
    return { raiz, base };
  };

  it('ejecuta la suite con el motivo base-desconocida cuando la base no existe [US-074 AC-1]', () => {
    const { raiz } = repositorio();

    const resultado = detectar({ raiz, base: '0000000000000000000000000000000000000000', reglas: REGLAS });

    expect(resultado.motivos).toEqual([{ ruta: '(diff completo)', motivo: 'base-desconocida' }]);
  });

  it('no dispara con una base legible cuando el diff no toca disparadores [US-074 AC-1]', () => {
    const { raiz, base } = repositorio();

    expect(detectar({ raiz, base, reglas: REGLAS })).toEqual({ dispara: false, motivos: [] });
  });

  it('propaga el error de las reglas en vez de disfrazarlo de base desconocida [US-074 AC-1]', () => {
    const { raiz, base } = repositorio();

    expect(() => detectar({ raiz, base, reglas: { rutas: ['{sin-cierre'], claves: { archivos: [] } } })).toThrow();
  });
});
