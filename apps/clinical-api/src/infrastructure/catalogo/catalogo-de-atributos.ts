import type { CatalogoDeAtributos } from '../../modules/clinical-attributes/ports.js';
import type { ProveedorDeCatalogo } from './catalog-version.provider.js';

/** Esqueleto: la lectura de `atributos.json` llega con el commit `feat` de L1D-80. */
export function crearCatalogoDeAtributos(
  _rutaDelCatalogo: string,
  _leerArchivo: (ruta: string) => string,
  _proveedor: ProveedorDeCatalogo,
): CatalogoDeAtributos {
  return {
    version: () => {
      throw new Error('no implementado');
    },
    atributosPermitidos: () => {
      throw new Error('no implementado');
    },
  };
}
