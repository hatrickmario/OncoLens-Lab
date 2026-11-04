import { z } from 'zod';
import { ConfiguracionInvalidaError } from '../../config/index.js';
import type { CatalogoDeEscalas } from '../../modules/manual-entry/ports.js';
import type { ProveedorDeCatalogo } from './catalog-version.provider.js';

/** Forma de `escalas.json` (`schemas/escalas.schema.json`): el validador del arranque ya la comprobó entera. */
const esquemaDeEscalas = z.object({
  sistemasDeEstadificacion: z.array(
    z.object({ codigo: z.string(), tiposDeCancer: z.array(z.string()) }),
  ),
  escalasFuncionales: z.array(
    z.object({ codigo: z.string(), minimo: z.number(), maximo: z.number() }),
  ),
  sistemasDeGradacion: z.array(
    z.object({ codigo: z.string(), tiposDeCancer: z.array(z.string()) }),
  ),
});

const esquemaDeManifiesto = z.object({ escalas: z.literal(true).optional() });

type SistemasPorTipo = readonly { codigo: string; tiposDeCancer: string[] }[] | undefined;

/** Códigos de los sistemas que declaran el tipo de cáncer, en el orden del catálogo. */
const codigosDelTipo = (sistemas: SistemasPorTipo, tipoDeCancer: string): string[] =>
  (sistemas ?? []).filter((s) => s.tiposDeCancer.includes(tipoDeCancer)).map((s) => s.codigo);

const sistemaValido = (sistemas: SistemasPorTipo, sistema: string, tipoDeCancer: string): boolean =>
  codigosDelTipo(sistemas, tipoDeCancer).includes(sistema);

const CATALOGO_SIN_ESCALAS: CatalogoDeEscalas['rangoDeEscala'] = () => undefined;

/**
 * Lee UNA vez `escalas.json` del catálogo montado (L1D-90, D6). Si el manifiesto no declara `escalas: true` (catálogos
 * anteriores a la 1.3.0) el catálogo no tiene valores válidos: todo registro de diagnóstico con esos campos se rechaza
 * con 422, nunca se acepta por omisión. Un `escalas.json` declarado e ilegible impide el arranque (fail-fast).
 */
export function crearCatalogoDeEscalas(
  rutaDelCatalogo: string,
  leerArchivo: (ruta: string) => string,
  proveedor: ProveedorDeCatalogo,
): CatalogoDeEscalas {
  let declarado: boolean;
  let escalas: z.output<typeof esquemaDeEscalas> | undefined;
  try {
    declarado =
      esquemaDeManifiesto.parse(JSON.parse(leerArchivo(`${rutaDelCatalogo}/manifest.json`)))
        .escalas === true;
    escalas = declarado
      ? esquemaDeEscalas.parse(JSON.parse(leerArchivo(`${rutaDelCatalogo}/escalas.json`)))
      : undefined;
  } catch {
    throw new ConfiguracionInvalidaError('CLINICAL_CATALOG_PATH', 'esquema_invalido', {
      motivo: 'catalogo_invalido',
    });
  }
  return {
    version: () => proveedor.version(),
    sistemaDeEstadificacionValido: (sistema, tipo) =>
      sistemaValido(escalas?.sistemasDeEstadificacion, sistema, tipo),
    rangoDeEscala:
      escalas === undefined
        ? CATALOGO_SIN_ESCALAS
        : (escala) => {
            const encontrada = escalas.escalasFuncionales.find((e) => e.codigo === escala);
            return encontrada && { minimo: encontrada.minimo, maximo: encontrada.maximo };
          },
    sistemaDeGradacionValido: (sistema, tipo) =>
      sistemaValido(escalas?.sistemasDeGradacion, sistema, tipo),
    sistemasDeEstadificacion: (tipo) => codigosDelTipo(escalas?.sistemasDeEstadificacion, tipo),
    escalasFuncionales: () => escalas?.escalasFuncionales ?? [],
    sistemasDeGradacion: (tipo) => codigosDelTipo(escalas?.sistemasDeGradacion, tipo),
  };
}
