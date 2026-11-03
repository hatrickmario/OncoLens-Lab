import { z } from 'zod';
import { ConfiguracionInvalidaError } from '../../config/index.js';
import type {
  AtributoPermitido,
  CatalogoDeAtributos,
} from '../../modules/clinical-attributes/ports.js';
import type { ProveedorDeCatalogo } from './catalog-version.provider.js';

const etiqueta = z.object({ es: z.string() });

/** Forma de `atributos.json` (`schemas/atributos.schema.json`): el validador del arranque ya la comprobó entera. */
const esquemaDeAtributos = z.object({
  keys: z.array(
    z.object({
      key: z.string(),
      cancerTypes: z.array(z.string()),
      label: etiqueta,
      values: z.array(z.object({ value: z.string(), label: etiqueta })).optional(),
    }),
  ),
});

/**
 * Lee UNA vez `atributos.json` del catálogo montado (RN-29): la única lista de atributos y valores permitidos. Una clave
 * sin `values` (catálogos anteriores a la 1.4.0) no admite ningún valor: todo registro con ella se rechaza con 422,
 * nunca se acepta por omisión. Un `atributos.json` ilegible impide el arranque (fail-fast).
 */
export function crearCatalogoDeAtributos(
  rutaDelCatalogo: string,
  leerArchivo: (ruta: string) => string,
  proveedor: ProveedorDeCatalogo,
): CatalogoDeAtributos {
  let atributos: z.output<typeof esquemaDeAtributos>;
  try {
    atributos = esquemaDeAtributos.parse(
      JSON.parse(leerArchivo(`${rutaDelCatalogo}/atributos.json`)),
    );
  } catch {
    throw new ConfiguracionInvalidaError('CLINICAL_CATALOG_PATH', 'esquema_invalido', {
      motivo: 'catalogo_invalido',
    });
  }
  return {
    version: () => proveedor.version(),
    atributosPermitidos: (tipoDeCancer): readonly AtributoPermitido[] =>
      atributos.keys
        .filter((clave) => clave.cancerTypes.includes(tipoDeCancer))
        .map((clave) => ({
          key: clave.key,
          label: clave.label.es,
          values: (clave.values ?? []).map((v) => ({ value: v.value, label: v.label.es })),
        })),
  };
}
