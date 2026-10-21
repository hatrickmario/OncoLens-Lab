/**
 * US-214 AC-1: la verificación del proveedor de clinical-api es automática solo si los tests pasan por `clienteVerificado`. Nada
 * impide importar `supertest` directamente en un test nuevo salvo esta regla de ESLint: solo `tests/support/` puede importarlo.
 */
import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const RAIZ = path.resolve(import.meta.dirname, '../../..');
const eslint = new ESLint({ cwd: RAIZ });
const IMPORTA_SUPERTEST = "import request from 'supertest';\nexport const cliente = request;\n";

const mensajesDe = async (filePath, codigo = IMPORTA_SUPERTEST) => {
  const [resultado] = await eslint.lintText(codigo, { filePath: path.join(RAIZ, filePath) });
  return resultado.messages.filter((mensaje) => mensaje.ruleId === 'no-restricted-imports').map((mensaje) => mensaje.message);
};

describe('supertest solo en tests/support de clinical-api [US-214 AC-1]', () => {
  it('rechaza importar supertest en un test de integración nuevo y nombra clienteVerificado', async () => {
    const mensajes = await mensajesDe('apps/clinical-api/tests/integration/nuevo/nuevo.test.ts');

    expect(mensajes).toHaveLength(1);
    expect(mensajes[0]).toContain('clienteVerificado');
  });

  it('rechaza también un import de tipo en un test: el tipo de la respuesta lo exporta el cliente verificado', async () => {
    const codigo = "import type { Response } from 'supertest';\nexport type R = Response;\n";

    expect(await mensajesDe('apps/clinical-api/tests/unit/nuevo.test.ts', codigo)).toHaveLength(1);
  });

  it('permite importar supertest en tests/support, que es donde vive clienteVerificado', async () => {
    expect(await mensajesDe('apps/clinical-api/tests/support/verificarProveedor.ts')).toEqual([]);
  });
});
