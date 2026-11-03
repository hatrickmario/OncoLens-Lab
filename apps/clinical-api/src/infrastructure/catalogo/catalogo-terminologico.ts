import { z } from 'zod';
import { ConfiguracionInvalidaError } from '../../config/index.js';
import {
  ESTANDARES,
  type CatalogoTerminologico,
  type EntradaDeCodigo,
  type SinonimosDeTermino,
} from '../../modules/reconciliation/ports.js';
import type { ProveedorDeCatalogo } from './catalog-version.provider.js';

/** Forma de `codigos.schema.json`: el validador del paquete no lee `codigos.json`, así que el arranque lo comprueba aquí. */
const esquemaDeCodigos = z.strictObject({
  entradas: z.array(
    z.strictObject({
      terminoCanonico: z.string().min(1),
      estandar: z.enum(ESTANDARES),
      codigo: z.string().min(1),
      nombreOficial: z.string().min(1),
      etiquetaEs: z.string().min(1),
      versionFuente: z.string().min(1),
    }),
  ),
});

/** Forma de `sinonimos.schema.json`. */
const esquemaDeSinonimos = z.strictObject({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  items: z.array(
    z.strictObject({
      terminoCanonico: z.string().min(1),
      sinonimos: z
        .array(z.strictObject({ texto: z.string().min(1), idioma: z.enum(['es', 'en']) }))
        .min(1),
    }),
  ),
});

interface TerminologiaDeUnTipo {
  readonly entradas: readonly EntradaDeCodigo[];
  readonly sinonimos: readonly SinonimosDeTermino[];
}

function leerTerminologiaDe(
  rutaDelCatalogo: string,
  tipo: string,
  leerArchivo: (ruta: string) => string,
): TerminologiaDeUnTipo {
  const leer = (archivo: string): unknown =>
    JSON.parse(leerArchivo(`${rutaDelCatalogo}/${tipo}/${archivo}`));
  const codigos = esquemaDeCodigos.parse(leer('codigos.json'));
  const sinonimos = esquemaDeSinonimos.parse(leer('sinonimos.json'));
  return {
    entradas: codigos.entradas.map(
      ({ terminoCanonico, estandar, codigo, nombreOficial, etiquetaEs }) => ({
        terminoCanonico,
        estandar,
        codigo,
        nombreOficial,
        etiquetaEs,
      }),
    ),
    sinonimos: sinonimos.items.map((item) => ({
      terminoCanonico: item.terminoCanonico,
      textos: item.sinonimos.map((s) => s.texto),
    })),
  };
}

/**
 * Lee UNA vez `codigos.json` y `sinonimos.json` de cada tipo de cáncer del manifiesto montado en
 * `CLINICAL_CATALOG_PATH`. Un archivo ilegible o que no cumple su esquema impide el arranque (fail-fast, US-041);
 * el error nombra la variable y nunca la ruta ni el contenido (RN-10, RN-14). Un tipo sin entradas es un catálogo
 * vacío, no un error.
 */
export function crearCatalogoTerminologico(
  rutaDelCatalogo: string,
  leerArchivo: (ruta: string) => string,
  proveedor: ProveedorDeCatalogo,
): CatalogoTerminologico {
  const porTipo = new Map<string, TerminologiaDeUnTipo>();
  try {
    for (const tipo of proveedor.cancerTypes()) {
      porTipo.set(tipo, leerTerminologiaDe(rutaDelCatalogo, tipo, leerArchivo));
    }
  } catch {
    throw new ConfiguracionInvalidaError('CLINICAL_CATALOG_PATH', 'esquema_invalido', {
      motivo: 'catalogo_invalido',
    });
  }
  return {
    version: () => proveedor.version(),
    entradas: (tipo, estandar) =>
      (porTipo.get(tipo)?.entradas ?? []).filter((e) => e.estandar === estandar),
    sinonimos: (tipo) => porTipo.get(tipo)?.sinonimos ?? [],
  };
}
