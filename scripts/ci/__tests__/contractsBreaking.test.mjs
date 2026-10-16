import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { PROVIDERS } from '../../contracts/lib/specs.mjs';

const ejecutar = promisify(execFile);
const SCRIPT = path.resolve(import.meta.dirname, '../contracts-breaking.sh');

describe('contracts-breaking.sh', () => {
  it('compara cada proveedor de PROVIDERS contra la base e imprime su nombre [US-036 AC-2]', async () => {
    const { stdout } = await ejecutar('bash', [SCRIPT, 'HEAD']);

    for (const proveedor of PROVIDERS) expect(stdout).toContain(`${proveedor}: comparado`);
    expect(stdout).toContain('sin cambios incompatibles');
  });

  it('sale con 2 y explica el uso cuando no recibe la base [US-036 AC-2]', async () => {
    const resultado = await ejecutar('bash', [SCRIPT]).catch((error) => error);

    expect(resultado.code).toBe(2);
    expect(resultado.stderr).toContain('uso:');
  });

  it('no repite la lista de proveedores en el script [US-036 AC-2]', async () => {
    const { readFile } = await import('node:fs/promises');
    const texto = await readFile(SCRIPT, 'utf8');

    for (const proveedor of PROVIDERS) expect(texto.replace(/#.*$/gm, '')).not.toContain(proveedor);
  });
});
