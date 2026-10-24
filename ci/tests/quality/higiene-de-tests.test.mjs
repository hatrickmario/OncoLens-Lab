import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import config, {
  bloqueHigieneDeTests,
  bloqueMockSoloEnBordes,
} from '../../../eslint.config.js';
import { desdeEslint } from '../../../scripts/quality/normalizar.mjs';
import { RAIZ } from './soporte.mjs';

// L1D-285 (test después): fixtures de PR con tests desactivados, enfocados o que mockean código propio. Se lintean con los
// MISMOS bloques que `eslint.config.js` exporta y aplica a los tests de web y clinical-api; el hallazgo sale normalizado
// como lo escribe `npm run quality` en reports/quality/latest.json (archivo, línea, regla).
const FIXTURES = 'ci/tests/quality/fixtures/tests';
const TIEMPO_MAXIMO_MS = 60_000;

async function hallazgosDe(nombre, bloques) {
  const eslint = new ESLint({ cwd: RAIZ, ignore: false, overrideConfig: bloques });
  const resultados = await eslint.lintFiles([path.join(FIXTURES, nombre)]);
  return desdeEslint(resultados, RAIZ);
}

const higiene = () => [bloqueHigieneDeTests([`${FIXTURES}/**`])];
const mocks = () => [bloqueMockSoloEnBordes([`${FIXTURES}/**`])];

describe('higiene de tests: desactivados y enfocados', () => {
  it.each([
    ['it-only.fixture.ts', 3, 'vitest/no-focused-tests'],
    ['fit.fixture.ts', 3, 'oncolens/tests-sin-pendientes-ni-foco-jest'],
    ['it-skip.fixture.ts', 3, 'vitest/no-disabled-tests'],
    ['describe-skip.fixture.ts', 2, 'vitest/no-disabled-tests'],
    ['xit.fixture.ts', 3, 'vitest/no-disabled-tests'],
    ['it-todo.fixture.ts', 3, 'oncolens/tests-sin-pendientes-ni-foco-jest'],
    ['it-skipif.fixture.ts', 3, 'oncolens/tests-sin-pendientes-ni-foco-jest'],
    ['it-runif.fixture.ts', 3, 'oncolens/tests-sin-pendientes-ni-foco-jest'],
    ['it-each-todo.fixture.ts', 3, 'oncolens/tests-sin-pendientes-ni-foco-jest'],
    ['it-bracket-todo.fixture.ts', 3, 'oncolens/tests-sin-pendientes-ni-foco-jest'],
    ['test-concurrent-todo.fixture.ts', 3, 'oncolens/tests-sin-pendientes-ni-foco-jest'],
    ['contexto-skip.fixture.ts', 3, 'oncolens/tests-sin-pendientes-ni-foco-jest'],
  ])(
    'falla nombrando archivo, línea y regla cuando %s desactiva o enfoca un test [US-213 AC-8]',
    async (nombre, linea, regla) => {
      const hallazgos = await hallazgosDe(nombre, higiene());

      expect(hallazgos).toEqual([
        expect.objectContaining({
          tool: 'eslint',
          rule: regla,
          file: `${FIXTURES}/${nombre}`,
          line: linea,
          severity: 'error',
        }),
      ]);
    },
    TIEMPO_MAXIMO_MS,
  );

  it('falla también con la regla propia cuando el salto viene de ctx.skip() [US-213 AC-8]', async () => {
    const hallazgos = await hallazgosDe('contexto-skip-miembro.fixture.ts', higiene());

    expect(hallazgos.map((hallazgo) => hallazgo.rule)).toContain('oncolens/tests-sin-pendientes-ni-foco-jest');
    expect(hallazgos.every((hallazgo) => hallazgo.line === 3)).toBe(true);
  }, TIEMPO_MAXIMO_MS);

  it('no reporta nada cuando el test no se desactiva ni se enfoca [US-213 AC-8]', async () => {
    expect(await hallazgosDe('limpio.fixture.ts', higiene())).toEqual([]);
  }, TIEMPO_MAXIMO_MS);

  it('aplica las reglas como error a los tests de web y de clinical-api en la configuración real [US-213 AC-8]', async () => {
    const eslint = new ESLint({ cwd: RAIZ });
    const rutas = [
      'apps/clinical-api/tests/integration/pacientes/listado.test.ts',
      'apps/web/tests/ui/login-form.test.tsx',
    ];

    for (const ruta of rutas) {
      const reglas = (await eslint.calculateConfigForFile(ruta)).rules;
      expect(reglas['vitest/no-focused-tests'][0]).toBe(2);
      expect(reglas['vitest/no-disabled-tests'][0]).toBe(2);
      expect(reglas['oncolens/tests-sin-pendientes-ni-foco-jest'][0]).toBe(2);
      expect(reglas['oncolens/mock-solo-en-bordes'][0]).toBe(2);
    }
  }, TIEMPO_MAXIMO_MS);

  it.each([
    'packages/test-support/tests/x.test.ts',
    'scripts/ci/__tests__/x.test.mjs',
    'ci/tests/x.test.mjs',
    'infra/docker/__tests__/x.test.mjs',
  ])('falla con vitest/no-disabled-tests cuando un it.skip vive en %s, no solo en web y clinical-api [US-213 AC-8]', async (ruta) => {
    const eslint = new ESLint({ cwd: RAIZ });

    const [resultado] = await eslint.lintText("it.skip('x', () => {});\n", { filePath: path.join(RAIZ, ruta) });

    expect(resultado.messages.map((mensaje) => mensaje.ruleId)).toContain('vitest/no-disabled-tests');
  }, TIEMPO_MAXIMO_MS);

  it('va después de las excepciones con caducidad para que ninguna pueda apagarla [US-213 AC-8]', () => {
    const bloques = config;
    const posicionDeHigiene = bloques.findLastIndex((bloque) => bloque.rules?.['vitest/no-focused-tests']);
    const ultimaExcepcion = bloques.findLastIndex((bloque) =>
      Object.values(bloque.rules ?? {}).some((valor) => valor === 'off' && bloque.files?.length === 1 && !bloque.files[0].includes('*')),
    );

    expect(posicionDeHigiene).toBeGreaterThan(ultimaExcepcion);
  });
});

describe('vi.mock solo sobre bordes', () => {
  it.each([
    ['mock-relativo.fixture.ts', './patients.repository'],
    ['mock-alias-web.fixture.ts', '@/lib/server/patients'],
    ['mock-alias-oncolens.fixture.ts', '@oncolens/api-contracts'],
    ['mock-prisma.fixture.ts', '@prisma/client'],
    ['mock-import-expr.fixture.ts', '../src/x.js'],
    ['mock-template.fixture.ts', '../x'],
    ['mock-corchetes.fixture.ts', './x'],
    ['mock-alias-vi.fixture.ts', './x'],
    ['mock-src.fixture.ts', 'src/modules/x'],
    ['mock-tilde.fixture.ts', '~/lib/x'],
  ])(
    'falla con mock-solo-en-bordes nombrando el módulo, el archivo y la línea cuando %s mockea código propio [US-213 AC-10]',
    async (nombre, modulo) => {
      const eslint = new ESLint({ cwd: RAIZ, ignore: false, overrideConfig: mocks() });
      const [resultado] = await eslint.lintFiles([path.join(FIXTURES, nombre)]);
      const [hallazgo] = desdeEslint([resultado], RAIZ);

      expect(hallazgo).toMatchObject({
        rule: 'oncolens/mock-solo-en-bordes',
        file: `${FIXTURES}/${nombre}`,
        line: 2,
        severity: 'error',
      });
      expect(resultado.messages[0].message).toContain(`'${modulo}'`);
    },
    TIEMPO_MAXIMO_MS,
  );

  it('falla por pg y por @prisma/adapter-pg, que son la base de datos [US-213 AC-10]', async () => {
    const hallazgos = await hallazgosDe('mock-pg.fixture.ts', mocks());

    expect(hallazgos.map((hallazgo) => hallazgo.line)).toEqual([2, 3]);
    expect(hallazgos.every((hallazgo) => hallazgo.rule === 'oncolens/mock-solo-en-bordes')).toBe(true);
  }, TIEMPO_MAXIMO_MS);

  it('falla por prisma y .prisma/client, que son el cliente de la base de datos [US-213 AC-10]', async () => {
    const hallazgos = await hallazgosDe('mock-prisma-paquete.fixture.ts', mocks());

    expect(hallazgos.map((hallazgo) => hallazgo.line)).toEqual([2, 3]);
  }, TIEMPO_MAXIMO_MS);

  it('reporta lo que no puede verificar cuando el módulo mockeado no es un texto literal [US-213 AC-10]', async () => {
    const eslint = new ESLint({ cwd: RAIZ, ignore: false, overrideConfig: mocks() });
    const [resultado] = await eslint.lintFiles([path.join(FIXTURES, 'mock-dinamico.fixture.ts')]);

    expect(resultado.messages).toHaveLength(1);
    expect(resultado.messages[0]).toMatchObject({ ruleId: 'oncolens/mock-solo-en-bordes', line: 3 });
    expect(resultado.messages[0].message).toContain('no es un texto literal');
  }, TIEMPO_MAXIMO_MS);

  it('permite vi.mock de un cliente de terceros que es borde y de next/* [US-213 AC-10]', async () => {
    expect(await hallazgosDe('mock-de-bordes.fixture.ts', mocks())).toEqual([]);
  }, TIEMPO_MAXIMO_MS);
});
