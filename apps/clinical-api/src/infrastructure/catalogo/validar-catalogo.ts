import { fileURLToPath } from 'node:url';
import { ConfiguracionInvalidaError } from '../../config/index.js';
import allowlistDelModelo from '../../../../../packages/clinical-catalogs/validator/modelo.allowlist.json' with { type: 'json' };
import esquemaDeAplicabilidad from '../../../../../packages/clinical-catalogs/schemas/aplicabilidad.schema.json' with { type: 'json' };
import esquemaDeDatosCriticos from '../../../../../packages/clinical-catalogs/schemas/datos-criticos.schema.json' with { type: 'json' };
import esquemaDeEscalas from '../../../../../packages/clinical-catalogs/schemas/escalas.schema.json' with { type: 'json' };
import esquemaDeValidation from '../../../../../packages/clinical-catalogs/schemas/validation.schema.json' with { type: 'json' };
import esquemaComun from '../../../../../packages/clinical-catalogs/schemas/comun.schema.json' with { type: 'json' };
import esquemaDeReglasDePoblacion from '../../../../../packages/clinical-catalogs/schemas/poblacion-reglas.schema.json' with { type: 'json' };
import esquemaDeMarcosDePregunta from '../../../../../packages/clinical-catalogs/schemas/marcos-de-pregunta.schema.json' with { type: 'json' };
import esquemaDePlantillas from '../../../../../packages/clinical-catalogs/schemas/plantillas.schema.json' with { type: 'json' };
import esquemaDeManifiesto from '../../../../../packages/clinical-catalogs/schemas/manifest.schema.json' with { type: 'json' };
import {
  ARCHIVOS_DE_RAIZ,
  ArchivoIlegibleError,
  leerCatalogo,
  validarCatalogo,
} from '../../../../../packages/clinical-catalogs/validator/index.mjs';

/**
 * Esquemas empaquetados por importación estática, abiertos a entradas nuevas (`l1d-335` añadirá `sinonimos`). Los de los
 * archivos de raíz NO se listan aquí: salen de `ARCHIVOS_DE_RAIZ` (`esquemasDeLaRaiz`), para que un archivo de raíz
 * nuevo del registro llegue al arranque sin editar este mapa (G1.6, design D15). Ni el tipo ni un test fijan sus claves.
 */
const ESQUEMAS_EMPAQUETADOS = {
  manifest: esquemaDeManifiesto,
  validation: esquemaDeValidation,
  comun: esquemaComun,
  'datos-criticos': esquemaDeDatosCriticos,
  aplicabilidad: esquemaDeAplicabilidad,
  'poblacion-reglas': esquemaDeReglasDePoblacion,
  escalas: esquemaDeEscalas,
  'marcos-de-pregunta': esquemaDeMarcosDePregunta,
  plantillas: esquemaDePlantillas,
};

/** `dist/` replica la disposición del repo (`rootDir ../..`), así que la misma ruta relativa sirve en fuente y compilado. */
const DIRECTORIO_DE_ESQUEMAS = fileURLToPath(
  new URL('../../../../../packages/clinical-catalogs/schemas/', import.meta.url),
);

/** Esquema de cada archivo de raíz del registro `ARCHIVOS_DE_RAIZ`, por el nombre de su esquema; lo lee `leerArchivo`. */
function esquemasDeLaRaiz(leerArchivo: (ruta: string) => string): Record<string, unknown> {
  return Object.fromEntries(
    Object.values(ARCHIVOS_DE_RAIZ as Record<string, { esquema: string }>).map(({ esquema }) => [
      esquema,
      JSON.parse(leerArchivo(`${DIRECTORIO_DE_ESQUEMAS}${esquema}.schema.json`)),
    ]),
  );
}

/** Código de la primera regla incumplida (cerrado: `destino_ausente`, `hash_distinto`...), o `null` si el catálogo valida. */
function codigoDeLaPrimeraViolacion(
  directorio: string,
  leerArchivo: (ruta: string) => string,
): string | null {
  try {
    const resultado = validarCatalogo({
      archivos: leerCatalogo(directorio, leerArchivo),
      allowlist: allowlistDelModelo,
      esquemas: { ...ESQUEMAS_EMPAQUETADOS, ...esquemasDeLaRaiz(leerArchivo) },
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
