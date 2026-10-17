import { describe, expect, it } from 'vitest';
import { ConfiguracionInvalidaError } from '../../../src/config.js';
import { crearProveedorDeVersionDeCatalogo } from '../../../src/modules/evidence-analysis/catalog-version.provider.js';

describe('crearProveedorDeVersionDeCatalogo', () => {
  it('devuelve la version del manifest.json del directorio del catálogo', () => {
    const leidos: string[] = [];
    const proveedor = crearProveedorDeVersionDeCatalogo('/catalogs', (ruta) => {
      leidos.push(ruta);
      return JSON.stringify({ version: '2026.10.0', cancerTypes: ['mama'] });
    });

    expect(proveedor.version()).toBe('2026.10.0');
    expect(leidos).toEqual(['/catalogs/manifest.json']);
  });

  it('lee el manifiesto una sola vez, al crearse', () => {
    let lecturas = 0;
    const proveedor = crearProveedorDeVersionDeCatalogo('/catalogs', () => {
      lecturas += 1;
      return JSON.stringify({ version: '1.0.0' });
    });

    proveedor.version();
    proveedor.version();

    expect(lecturas).toBe(1);
  });

  const noExiste = (): string => {
    throw new Error('ENOENT: /catalogs/secreto');
  };

  it.each([
    ['no existe', noExiste],
    ['no es JSON', () => 'no es json'],
    ['no tiene version', () => JSON.stringify({ cancerTypes: [] })],
    ['tiene una version vacía', () => JSON.stringify({ version: '' })],
  ])(
    'falla nombrando CLINICAL_CATALOG_PATH y sin citar la ruta ni el contenido cuando el manifiesto %s',
    (_caso, lector) => {
      try {
        crearProveedorDeVersionDeCatalogo('/catalogs/secreto', lector);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfiguracionInvalidaError);
        expect((error as ConfiguracionInvalidaError).variable).toBe('CLINICAL_CATALOG_PATH');
        expect((error as Error).message).not.toContain('secreto');
        return;
      }
      throw new Error('debía fallar y no lo hizo');
    },
  );
});
