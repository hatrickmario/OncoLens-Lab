import { describe, expect, it } from 'vitest';
import integracion from '../../vitest.integration.config.js';
import unitaria from '../../vitest.config.js';

/**
 * Cada carpeta de `tests/integration/` que corre contra PostgreSQL debe estar en el `include` de la configuración de
 * integración Y en el `exclude` de la unitaria; si solo está en una, su suite corre dos veces o no corre (deuda l1d-94).
 */
const CARPETA = /^tests\/integration\/([^/]+)\/\*\*/;

const carpetasDe = (patrones: readonly string[] | undefined): string[] =>
  (patrones ?? [])
    .map((patron) => CARPETA.exec(patron)?.[1])
    .filter((carpeta): carpeta is string => carpeta !== undefined)
    .sort();

describe('configuración de Vitest', () => {
  it('excluye de la suite unitaria las mismas carpetas que incluye la de integración cuando se comparan sus listas', () => {
    const incluidas = carpetasDe(integracion.test?.include);
    const excluidas = carpetasDe(unitaria.test?.exclude);

    expect(incluidas.length).toBeGreaterThan(0);
    expect(excluidas).toEqual(incluidas);
  });
});
