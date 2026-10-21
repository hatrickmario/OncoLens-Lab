import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ_SRC = path.resolve(import.meta.dirname, '../../src');
/** Único lugar donde el entorno entra al proceso: la raíz de composición se lo pasa al módulo de configuración. */
const RAICES_DE_COMPOSICION = [
  path.join(RAIZ_SRC, 'server.ts'),
  // CLI `oncolens` (L1D-199): segunda raíz de composición, igual que el seed fuera de `src/`.
  path.join(RAIZ_SRC, 'cli', 'oncolens.ts'),
  // Comando `eval:pii` (L1D-205): tercera raíz de composición; pasa el entorno a `readDeidentificationConfig`.
  path.join(RAIZ_SRC, 'cli', 'medir-pii.ts'),
];
const MODULO_DE_CONFIGURACION = path.join(RAIZ_SRC, 'config') + path.sep;

/**
 * Formas de leer el entorno del proceso: `process.env`, `process['env']`, `const { env } = process`,
 * `import { env } from 'node:process'` y los import por defecto o de espacio de nombres del módulo `process`.
 */
const LECTURAS_DE_ENTORNO: readonly RegExp[] = [
  /\bprocess\s*(?:\.\s*env\b|\[\s*['"`]env['"`]\s*\])/,
  /\{[^}]*\benv\b[^}]*\}\s*=\s*(?:globalThis\s*\.\s*)?process\b/,
  /import\s*\{[^}]*\benv\b[^}]*\}\s*from\s*['"`](?:node:)?process['"`]/,
  /import\s+(?:\*\s+as\s+\w+|\w+)\s+from\s*['"`](?:node:)?process['"`]/,
];

const leeElEntorno = (texto: string): boolean =>
  LECTURAS_DE_ENTORNO.some((regla) => regla.test(texto));

function archivosTs(directorio: string): string[] {
  return readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(directorio, entrada.name);
    if (entrada.isDirectory()) return archivosTs(ruta);
    return entrada.name.endsWith('.ts') ? [ruta] : [];
  });
}

describe('lectura del entorno', () => {
  it('detecta process.env en sus formas de acceso, para que la regla de abajo no pase por un detector roto [US-037 AC-1]', () => {
    for (const lectura of [
      'const a = process.env.PORT;',
      "const b = process.env['PORT'];",
      'const c = process . env;',
      "const d = process['env'];",
      'const { PORT } = process.env;',
      'const { env } = process;',
      'const { env: entorno } = process;',
      "import { env } from 'node:process';",
      "import { env as entorno } from 'process';",
      "import * as proceso from 'node:process';",
      "import proceso from 'node:process';",
      'const e = globalThis.process.env;',
    ]) {
      expect(leeElEntorno(lectura), lectura).toBe(true);
    }
    expect(leeElEntorno('const e = entorno.env;')).toBe(false);
    expect(leeElEntorno('const { pid } = process;')).toBe(false);
    expect(leeElEntorno("import { pid } from 'node:process';")).toBe(false);
  });

  it('ningún archivo de src fuera de src/config y de la raíz de composición lee process.env [US-037 AC-1]', () => {
    const infractores = archivosTs(RAIZ_SRC)
      .filter(
        (ruta) =>
          !RAICES_DE_COMPOSICION.includes(ruta) && !ruta.startsWith(MODULO_DE_CONFIGURACION),
      )
      .filter((ruta) => leeElEntorno(readFileSync(ruta, 'utf8')))
      .map((ruta) => path.relative(RAIZ_SRC, ruta));

    expect(infractores).toEqual([]);
  });

  it('el módulo de configuración tampoco lee process.env: recibe el entorno por parámetro [US-037 AC-1]', () => {
    const infractores = archivosTs(path.join(RAIZ_SRC, 'config'))
      .filter((ruta) => leeElEntorno(readFileSync(ruta, 'utf8')))
      .map((ruta) => path.relative(RAIZ_SRC, ruta));

    expect(infractores).toEqual([]);
  });
});
