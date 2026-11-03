import type { CatalogoTerminologico } from '../../modules/reconciliation/ports.js';
import type { ProveedorDeCatalogo } from './catalog-version.provider.js';

export function crearCatalogoTerminologico(
  _rutaDelCatalogo: string,
  _leerArchivo: (ruta: string) => string,
  _proveedor: ProveedorDeCatalogo,
): CatalogoTerminologico {
  throw new Error('no implementado');
}
