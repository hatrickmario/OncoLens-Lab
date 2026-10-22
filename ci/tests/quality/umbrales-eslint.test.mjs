import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { bloqueTamanoClinicalApi, bloqueTamanoWeb } from '../../../eslint.config.js';
import { desdeEslint } from '../../../scripts/quality/normalizar.mjs';
import { validarUmbrales } from '../../../scripts/quality/umbrales.mjs';
import { RAIZ, ejecutar } from './soporte.mjs';

const UMBRALES = validarUmbrales({
  maxLinesPerFunction: 40,
  complexity: 10,
  c901MaxComplexity: 10,
  plr0915MaxStatements: 50,
  web: { componentLinesWarn: 100, componentLinesError: 150 },
});

const directorioTemporal = () => {
  const base = path.join(RAIZ, 'node_modules/.cache/oncolens-quality');
  mkdirSync(base, { recursive: true });
  return mkdtempSync(path.join(base, 'umbrales-'));
};

/** Lintea `codigo` como si viviera en `ruta` (relativa a la raíz del repo) con solo los bloques dados. */
async function lintear(codigo, ruta, bloques) {
  const cwd = directorioTemporal();
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [tseslint.configs.base, { files: ['**/*.{ts,tsx}'] }, ...bloques],
  });
  const resultados = await eslint.lintText(codigo, { filePath: path.join(cwd, ruta) });
  return desdeEslint(resultados, cwd);
}

const funcionDeLineas = (lineas) =>
  `export function larga() {\n${'  console.log(1);\n'.repeat(lineas - 2)}}\n`;

const funcionConComplejidad = (complejidad) =>
  `export function ramificada(x: number) {\n${'  if (x === 1) console.log(1);\n'.repeat(complejidad - 1)}}\n`;

const componenteDeLineas = (lineas) =>
  Array.from({ length: lineas }, (_, i) => `export const valor${i} = ${i};`).join('\n') + '\n';

const RUTA_SERVICE = 'apps/clinical-api/src/modules/x/x.service.ts';
const RUTA_COMPONENTE = 'apps/web/components/organisms/panel.tsx';

describe('umbrales de clinical-api en ESLint', () => {
  it('falla nombrando max-lines-per-function, la función, 41 y 40 cuando una función supera el umbral [US-213 AC-4]', async () => {
    const [hallazgo] = await lintear(funcionDeLineas(41), RUTA_SERVICE, [
      bloqueTamanoClinicalApi(UMBRALES),
    ]);

    expect(hallazgo).toMatchObject({
      rule: 'max-lines-per-function',
      severity: 'error',
      symbol: 'larga',
      measured: 41,
      threshold: 40,
    });
  });

  it('no reporta cuando la función mide exactamente el umbral [US-213 AC-4]', async () => {
    const hallazgos = await lintear(funcionDeLineas(40), RUTA_SERVICE, [
      bloqueTamanoClinicalApi(UMBRALES),
    ]);

    expect(hallazgos).toEqual([]);
  });

  it('falla nombrando complexity, la función, 11 y 10 cuando la complejidad supera el umbral [US-213 AC-4]', async () => {
    const [hallazgo] = await lintear(funcionConComplejidad(11), RUTA_SERVICE, [
      bloqueTamanoClinicalApi(UMBRALES),
    ]);

    expect(hallazgo).toMatchObject({
      rule: 'complexity',
      severity: 'error',
      symbol: 'ramificada',
      measured: 11,
      threshold: 10,
    });
  });

  it('no mide los tests de clinical-api [US-213 AC-4]', async () => {
    const hallazgos = await lintear(funcionDeLineas(60), 'apps/clinical-api/tests/x.test.ts', [
      bloqueTamanoClinicalApi(UMBRALES),
    ]);

    expect(hallazgos).toEqual([]);
  });
});

describe('umbral único en quality-thresholds.json', () => {
  /** ESLint real con la configuración de la raíz en un proceso nuevo, leyendo los umbrales de `rutaUmbrales`. */
  function lintearConConfiguracionReal(rutaUmbrales) {
    const guion = `
      import { ESLint } from 'eslint';
      const eslint = new ESLint({ cwd: process.cwd() });
      const [r] = await eslint.lintText(${JSON.stringify(funcionDeLineas(41))}, { filePath: 'apps/clinical-api/src/modules/x/x.service.ts' });
      console.log(JSON.stringify(r.messages.map((m) => m.ruleId)));`;
    const env = { ...process.env, QUALITY_THRESHOLDS: rutaUmbrales };
    const resultado = ejecutar('node', ['--input-type=module', '-e', guion], { env });
    return JSON.parse(resultado.salida.trim().split('\n').pop());
  }

  it('pasa la misma función de 41 líneas cuando solo se sube maxLinesPerFunction a 45 en el JSON [US-213 AC-6]', () => {
    const directorio = directorioTemporal();
    const con40 = path.join(directorio, 'u40.json');
    const con45 = path.join(directorio, 'u45.json');
    writeFileSync(con40, JSON.stringify(UMBRALES));
    writeFileSync(con45, JSON.stringify({ ...UMBRALES, maxLinesPerFunction: 45 }));

    expect(lintearConConfiguracionReal(con40)).toContain('max-lines-per-function');
    expect(lintearConConfiguracionReal(con45)).not.toContain('max-lines-per-function');
  });

  it('falla nombrando la clave complexity cuando el archivo de umbrales no la trae [US-213 AC-6]', () => {
    const directorio = directorioTemporal();
    const ruta = path.join(directorio, 'quality-thresholds.json');
    const sinComplexity = { ...UMBRALES, complexity: undefined };
    writeFileSync(ruta, JSON.stringify(sinComplexity));

    const resultado = ejecutar('node', ['scripts/quality/quality.mjs'], {
      env: { ...process.env, QUALITY_THRESHOLDS: ruta },
    });

    expect(resultado.estado).toBe(1);
    expect(resultado.salida).toContain('complexity');
  });
});

describe('tamaño de componentes de web en ESLint', () => {
  const alerta = (cwdLineas, ruta = RUTA_COMPONENTE) =>
    lintear(componenteDeLineas(cwdLineas), ruta, [bloqueTamanoWeb(UMBRALES, 'warn')]);
  const limiteDuro = (lineas, ruta = RUTA_COMPONENTE) =>
    lintear(componenteDeLineas(lineas), ruta, [bloqueTamanoWeb(UMBRALES, 'error')]);

  it('alerta con archivo, 120 y 100 sin fallar cuando un componente mide 120 líneas [US-213 AC-7]', async () => {
    const [hallazgo] = await alerta(120);

    expect(hallazgo).toMatchObject({
      rule: 'max-lines',
      severity: 'warn',
      file: RUTA_COMPONENTE,
      measured: 120,
      threshold: 100,
    });
    expect(await limiteDuro(120)).toEqual([]);
  });

  it('falla con archivo, 151 y 150 cuando un componente mide 151 líneas [US-213 AC-7]', async () => {
    const [hallazgo] = await limiteDuro(151);

    expect(hallazgo).toMatchObject({
      rule: 'max-lines',
      severity: 'error',
      file: RUTA_COMPONENTE,
      measured: 151,
      threshold: 150,
    });
  });

  it('no mide las primitivas de shadcn en components/ui [US-213 AC-7]', async () => {
    const ruta = 'apps/web/components/ui/tabla.tsx';

    expect(await limiteDuro(200, ruta)).toEqual([]);
    expect(await alerta(200, ruta)).toEqual([]);
  });

  it('no mide los tests de componentes [US-213 AC-7]', async () => {
    expect(await limiteDuro(200, 'apps/web/components/organisms/panel.test.tsx')).toEqual([]);
  });

  it('no cuenta blancos ni comentarios [US-213 AC-7]', async () => {
    const codigo = `${componenteDeLineas(100)}\n\n// comentario\n/* otro */\n`;

    const hallazgos = await lintear(codigo, RUTA_COMPONENTE, [bloqueTamanoWeb(UMBRALES, 'warn')]);

    expect(hallazgos).toEqual([]);
  });
});
