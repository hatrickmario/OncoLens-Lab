import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { casaConGlob } from '../lib/glob.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../../..');
const REGLAS = YAML.parse(readFileSync(path.join(RAIZ, 'scripts/ci/cambios-paths.yaml'), 'utf8'));
const TIEMPO_MAXIMO = 30_000;

// Ruta literal de un documento del repositorio (raíz conocida, sin comodines ni interpolación) o el readme.
const RUTA_DE_DOCUMENTO = /(?<![\w./-])((?:docs|backlog|openspec|reports)\/[A-Za-z0-9_./-]+\.md|readme\.md)(?![\w.-])/g;
// Una mención en un comentario o en un mensaje no es una lectura: solo cuentan las líneas que abren o resuelven la ruta.
const LECTURA = /readFileSync|read_text|read_bytes|\bopen\(|\bPath\(|new URL\(|fileURLToPath|path\.(?:join|resolve)\(|\bcp\(|\braiz\s*\/|\$raiz\/|RUTA_|DOCUMENTO_DE|\breadme:|dataModel:/;
const CARPETAS = ['scripts', 'apps', 'packages', 'infra'];

/** Rutas literales `*.md` que leen los archivos de código y de tests, con el primer archivo que las lee. */
function documentosLeidosPorElCodigo() {
  const salida = execFileSync('git', ['-C', RAIZ, 'grep', '-n', '-I', '-E', '\\.md', '--', ...CARPETAS, ':(exclude)**/node_modules/**', ':(exclude)scripts/ci/__tests__/cambiosPathsCobertura.test.mjs'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const lectores = new Map();
  for (const linea of salida.split('\n').filter(Boolean)) {
    const [, archivo, texto] = /^([^:]+):\d+:(.*)$/.exec(linea) ?? [];
    if (!archivo || !LECTURA.test(texto) || /^\s*(?:#|\/\/|\*|\/\*)/.test(texto)) continue;
    for (const [, ruta] of texto.matchAll(RUTA_DE_DOCUMENTO)) if (!lectores.has(ruta)) lectores.set(ruta, archivo);
  }
  return lectores;
}

describe('consumidos_por_codigo', () => {
  it('cubre todo .md literal que leen scripts, apps, packages e infra [D-12.1]', () => {
    const lectores = documentosLeidosPorElCodigo();

    const sinCubrir = [...lectores]
      .filter(([ruta]) => !REGLAS.consumidos_por_codigo.some((glob) => casaConGlob(ruta, glob)))
      .map(([ruta, archivo]) => `${ruta} (lo lee ${archivo}): añádelo a consumidos_por_codigo de scripts/ci/cambios-paths.yaml`);

    expect(lectores.size).toBeGreaterThan(0);
    expect(sinCubrir).toEqual([]);
  }, TIEMPO_MAXIMO);

  it('reconoce las lecturas conocidas del data-model, el ADR-39 y el readme [D-12.1]', () => {
    const rutas = [...documentosLeidosPorElCodigo().keys()];

    expect(rutas).toEqual(expect.arrayContaining(['docs/architecture/data-model.md', 'docs/architecture/adr/ADR-39-modelos-locales.md', 'readme.md']));
  }, TIEMPO_MAXIMO);
});
