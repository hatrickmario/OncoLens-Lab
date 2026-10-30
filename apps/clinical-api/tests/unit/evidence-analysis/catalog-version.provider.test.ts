import { describe, expect, it } from 'vitest';
import { ConfiguracionInvalidaError } from '../../../src/config/index.js';
import { crearProveedorDeCatalogo } from '../../../src/infrastructure/catalogo/catalog-version.provider.js';

describe('crearProveedorDeCatalogo', () => {
  it('devuelve la version del manifest.json del directorio del catálogo', () => {
    const leidos: string[] = [];
    const proveedor = crearProveedorDeCatalogo('/catalogs', (ruta) => {
      leidos.push(ruta);
      return JSON.stringify({ version: '2026.10.0', cancerTypes: ['mama'] });
    });

    expect(proveedor.version()).toBe('2026.10.0');
    expect(leidos).toEqual(['/catalogs/manifest.json']);
  });

  it('devuelve los cancerTypes del manifiesto', () => {
    const proveedor = crearProveedorDeCatalogo('/catalogs', () =>
      JSON.stringify({ version: '1.0.0', cancerTypes: ['mama', 'prostata'] }),
    );

    expect(proveedor.cancerTypes()).toEqual(['mama', 'prostata']);
  });

  it('lee el manifiesto una sola vez, al crearse', () => {
    let lecturas = 0;
    const proveedor = crearProveedorDeCatalogo('/catalogs', () => {
      lecturas += 1;
      return JSON.stringify({ version: '1.0.0', cancerTypes: [] });
    });

    proveedor.version();
    proveedor.version();

    expect(lecturas).toBe(1);
  });

  it('falla con version_catalogo_distinta sin citar versiones cuando la expectativa difiere del manifiesto', () => {
    try {
      crearProveedorDeCatalogo(
        '/catalogs',
        () => JSON.stringify({ version: '1.0.0', cancerTypes: [] }),
        '9.9.9',
      );
    } catch (error) {
      expect((error as ConfiguracionInvalidaError).variable).toBe('CLINICAL_CATALOG_VERSION');
      expect((error as ConfiguracionInvalidaError).motivo).toBe('version_catalogo_distinta');
      expect((error as Error).message).not.toMatch(/9\.9\.9|1\.0\.0/);
      return;
    }
    throw new Error('debía fallar y no lo hizo');
  });

  it('acepta la expectativa cuando coincide con el manifiesto', () => {
    const proveedor = crearProveedorDeCatalogo(
      '/catalogs',
      () => JSON.stringify({ version: '1.0.0', cancerTypes: [] }),
      '1.0.0',
    );

    expect(proveedor.version()).toBe('1.0.0');
  });

  const noExiste = (): string => {
    throw new Error('ENOENT: /catalogs/secreto');
  };

  it.each([
    ['no existe', noExiste],
    ['no es JSON', () => 'no es json'],
    ['no tiene version', () => JSON.stringify({ cancerTypes: [] })],
    ['tiene una version vacía', () => JSON.stringify({ version: '', cancerTypes: [] })],
    ['no tiene cancerTypes', () => JSON.stringify({ version: '1.0.0' })],
  ])(
    'falla nombrando CLINICAL_CATALOG_PATH y sin citar la ruta ni el contenido cuando el manifiesto %s',
    (_caso, lector) => {
      try {
        crearProveedorDeCatalogo('/catalogs/secreto', lector);
      } catch (error) {
        expect(error).toBeInstanceOf(ConfiguracionInvalidaError);
        expect((error as ConfiguracionInvalidaError).variable).toBe('CLINICAL_CATALOG_PATH');
        expect((error as ConfiguracionInvalidaError).motivo).toBe('catalogo_no_disponible');
        expect((error as Error).message).not.toContain('secreto');
        return;
      }
      throw new Error('debía fallar y no lo hizo');
    },
  );
});
