import { fileURLToPath } from 'node:url';
import { ConfiguracionInvalidaError } from '../../config/index.js';
import allowlistDelModelo from '../../../../../packages/clinical-catalogs/validator/modelo.allowlist.json' with { type: 'json' };
import {
  ArchivoIlegibleError,
  leerCatalogo,
  leerEsquemas,
  validarCatalogo,
} from '../../../../../packages/clinical-catalogs/validator/index.mjs';

/**
 * Los esquemas salen de `leerEsquemas`, derivados de los registros del validador (raíz, declarados, por tipo, por lista):
 * un archivo nuevo de cualquier registro llega al arranque sin editar un mapa aquí (G1.6, design D15). `dist/` replica la disposición del repo (`rootDir ../..`), así que la misma ruta relativa sirve en fuente y compilado. */
const DIRECTORIO_DE_ESQUEMAS = fileURLToPath(
  new URL('../../../../../packages/clinical-catalogs/schemas/', import.meta.url),
);

/** Código de la primera regla incumplida (cerrado: `destino_ausente`, `hash_distinto`...), o `null` si el catálogo valida. */
function codigoDeLaPrimeraViolacion(
  directorio: string,
  leerArchivo: (ruta: string) => string,
): string | null {
  try {
    const resultado = validarCatalogo({
      archivos: leerCatalogo(directorio, leerArchivo),
      allowlist: allowlistDelModelo,
      esquemas: leerEsquemas(DIRECTORIO_DE_ESQUEMAS, leerArchivo),
    });
    return resultado.valido ? null : (resultado.violaciones[0]?.codigo ?? 'esquema_invalido');
  } catch (error) {
    if (error instanceof ArchivoIlegibleError) return error.codigo as string;
    // Un error inesperado de forma también es un catálogo inválido: el arranque emite el evento único y no relanza.
    return 'esquema_invalido';
  }
}

/**
 * `catalog:validate` al arrancar (L1D-93 D5, RN-29): un catálogo que no valida deja el servicio no listo. El error
 * lleva el código de la regla incumplida y nunca la ruta, el ítem ni el contenido del catálogo (RN-10, RN-14).
 */
export function exigirCatalogoValido(
  directorio: string,
  leerArchivo: (ruta: string) => string,
): void {
  const codigo = codigoDeLaPrimeraViolacion(directorio, leerArchivo);
  if (codigo !== null) {
    throw new ConfiguracionInvalidaError('CLINICAL_CATALOG_PATH', codigo, {
      motivo: 'catalogo_invalido',
    });
  }
}
