import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = path.resolve(import.meta.dirname, '../../..');

/** Corre el script real como lo hace la CI (`npm run lint:lenguaje -- <dir>`). */
function lintLenguaje(directorio) {
  const resultado = spawnSync('npm', ['run', '--silent', 'lint:lenguaje', '--', directorio], {
    cwd: RAIZ,
    encoding: 'utf8',
  });
  return { codigo: resultado.status, salida: `${resultado.stdout}${resultado.stderr}` };
}

describe('lint:lenguaje', () => {
  it('falla y nombra la clave fixture.prohibido cuando un mensaje contiene "el mejor tratamiento" [US-068 AC-5]', () => {
    const { codigo, salida } = lintLenguaje('ci/tests/lenguaje/con-termino');

    expect(codigo).toBe(1);
    expect(salida).toContain('ci/tests/lenguaje/con-termino/es.json:fixture.prohibido');
    expect(salida).toContain(
      'término prohibido "el mejor tratamiento" (es-el-mejor-tratamiento, nivel A)',
    );
  });

  it('falla y nombra la clave fixture.raiz con nivel B cuando un mensaje usa la raíz recomend [US-068 AC-5]', () => {
    const { codigo, salida } = lintLenguaje('ci/tests/lenguaje/con-raiz');

    expect(codigo).toBe(1);
    expect(salida).toContain('ci/tests/lenguaje/con-raiz/es.json:fixture.raiz');
    expect(salida).toContain('(b-recomend, nivel B)');
  });

  it('termina con 0 cuando los mensajes no tienen términos prohibidos [US-068 AC-5]', () => {
    const { codigo } = lintLenguaje('ci/tests/lenguaje/limpio');

    expect(codigo).toBe(0);
  });

  it('termina con 0 sobre los mensajes reales de web [US-068 AC-5]', () => {
    const { codigo, salida } = lintLenguaje('apps/web/messages');

    expect(salida).not.toContain('término prohibido');
    expect(codigo).toBe(0);
  });

  it('falla nombrando la ruta cuando el directorio de mensajes no existe o está vacío [US-068 AC-5]', () => {
    const { codigo, salida } = lintLenguaje('ci/tests/lenguaje/no-existe');

    expect(codigo).toBe(1);
    expect(salida).toContain('ci/tests/lenguaje/no-existe');
  });
});
