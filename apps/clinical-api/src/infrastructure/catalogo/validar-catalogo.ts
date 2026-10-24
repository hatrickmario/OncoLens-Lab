import { ConfiguracionInvalidaError } from '../../config/index.js';
import allowlistDelModelo from '../../../../../packages/clinical-catalogs/validator/modelo.allowlist.json' with { type: 'json' };
import esquemaDeAplicabilidad from '../../../../../packages/clinical-catalogs/schemas/aplicabilidad.schema.json' with { type: 'json' };
import esquemaDeAtributos from '../../../../../packages/clinical-catalogs/schemas/atributos.schema.json' with { type: 'json' };
import esquemaDeDatosCriticos from '../../../../../packages/clinical-catalogs/schemas/datos-criticos.schema.json' with { type: 'json' };
import esquemaDeManifiesto from '../../../../../packages/clinical-catalogs/schemas/manifest.schema.json' with { type: 'json' };
import {
  ArchivoIlegibleError,
  leerCatalogo,
  validarCatalogo,
} from '../../../../../packages/clinical-catalogs/validator/index.mjs';

const ESQUEMAS = {
  manifest: esquemaDeManifiesto,
  atributos: esquemaDeAtributos,
  datosCriticos: esquemaDeDatosCriticos,
  aplicabilidad: esquemaDeAplicabilidad,
};

/** Código de la primera regla incumplida (cerrado: `destino_ausente`, `hash_distinto`...), o `null` si el catálogo valida. */
function codigoDeLaPrimeraViolacion(
  directorio: string,
  leerArchivo: (ruta: string) => string,
): string | null {
  try {
    const resultado = validarCatalogo({
      archivos: leerCatalogo(directorio, leerArchivo),
      allowlist: allowlistDelModelo,
      esquemas: ESQUEMAS,
    });
    return resultado.valido ? null : (resultado.violaciones[0]?.codigo ?? 'esquema_invalido');
  } catch (error) {
    if (error instanceof ArchivoIlegibleError) return error.codigo as string;
    throw error;
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
