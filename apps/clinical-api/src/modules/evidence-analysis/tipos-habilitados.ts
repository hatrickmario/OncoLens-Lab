import { validarTiposHabilitados } from '../../config/index.js';
import type { TiposDeCancerHabilitados } from './ports.js';

/**
 * Adaptador de `TiposDeCancerHabilitados` (RN-20, RN-22). Valida la lista contra los tipos del catálogo al crearse,
 * de modo que no existe una instancia con un tipo desconocido: lanza `tipo_no_en_catalogo` (US-043 AC-5).
 */
export function crearTiposHabilitados(
  habilitados: readonly string[],
  tiposDelCatalogo: readonly string[],
): TiposDeCancerHabilitados {
  const validados = validarTiposHabilitados(habilitados, tiposDelCatalogo);
  return { estaHabilitado: (tipo) => validados.includes(tipo) };
}
