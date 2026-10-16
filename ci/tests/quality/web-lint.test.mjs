import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { bloqueWeb } from '../../../eslint.config.js';
import { RAIZ } from './soporte.mjs';

const FIXTURES_WEB = 'ci/tests/quality/fixtures/web';

/** Lintea un fixture con la configuración real de la raíz y el bloque `web` aplicado a él. */
async function lintearFixture(nombre) {
  const eslint = new ESLint({
    cwd: RAIZ,
    ignore: false,
    overrideConfig: [bloqueWeb([`${FIXTURES_WEB}/**`])],
  });
  const [resultado] = await eslint.lintFiles([path.join(FIXTURES_WEB, nombre)]);
  return resultado;
}

const errorDe = (resultado, regla) =>
  resultado.messages.find((mensaje) => mensaje.ruleId === regla);

describe('lint del bloque web', () => {
  it('falla con react-hooks/rules-of-hooks y nombra archivo y línea cuando un hook se llama en un condicional [US-215 AC-2]', async () => {
    const resultado = await lintearFixture('hook-condicional.tsx');
    const mensaje = errorDe(resultado, 'react-hooks/rules-of-hooks');

    expect(mensaje?.severity).toBe(2);
    expect(mensaje?.line).toBe(5);
    expect(resultado.filePath).toMatch(/hook-condicional\.tsx$/);
  });

  it('falla con react-hooks/exhaustive-deps como error cuando useEffect omite una dependencia [US-215 AC-2]', async () => {
    const resultado = await lintearFixture('effect-sin-dependencia.tsx');
    const mensaje = errorDe(resultado, 'react-hooks/exhaustive-deps');

    expect(mensaje?.severity).toBe(2);
    expect(resultado.filePath).toMatch(/effect-sin-dependencia\.tsx$/);
  });

  it('falla con jsx-a11y/alt-text cuando una imagen no tiene alt [US-215 AC-3]', async () => {
    const mensaje = errorDe(await lintearFixture('img-sin-alt.tsx'), 'jsx-a11y/alt-text');

    expect(mensaje?.severity).toBe(2);
  });

  it('falla con la regla de jsx-a11y cuando un div clicable no tiene rol ni manejador de teclado [US-215 AC-3]', async () => {
    const resultado = await lintearFixture('div-clicable.tsx');
    const reglas = resultado.messages.map((mensaje) => mensaje.ruleId);

    expect(reglas).toContain('jsx-a11y/click-events-have-key-events');
    expect(reglas).toContain('jsx-a11y/no-static-element-interactions');
  });

  it('falla con react/no-danger y nombra archivo y línea cuando un componente usa dangerouslySetInnerHTML [US-215 AC-3]', async () => {
    const resultado = await lintearFixture('dangerously-set.tsx');
    const mensaje = errorDe(resultado, 'react/no-danger');

    expect(mensaje?.severity).toBe(2);
    expect(mensaje?.line).toBe(2);
    expect(resultado.filePath).toMatch(/dangerously-set\.tsx$/);
  });

  it("falla con oncolens/no-restricted-imports-en-cliente cuando un módulo 'use client' importa lib/server [US-215 AC-3]", async () => {
    const resultado = await lintearFixture('cliente-importa-server.tsx');
    const mensaje = errorDe(resultado, 'oncolens/no-restricted-imports-en-cliente');

    expect(mensaje?.severity).toBe(2);
    expect(mensaje?.line).toBe(3);
  });

  it("no marca el import de lib/server cuando el módulo no tiene la directiva 'use client' [US-215 AC-3]", async () => {
    const resultado = await lintearFixture('servidor-importa-server.tsx');

    expect(resultado.messages).toEqual([]);
  });
});
