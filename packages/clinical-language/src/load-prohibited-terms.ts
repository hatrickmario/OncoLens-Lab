import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { clavesDe, palabrasDe } from './normalizar.js';
import { posicionesDe } from './secuencias.js';
import type { ListaTerminos } from './tipos.js';

/** Ruta de la lista versionada dentro del monorepo (a la misma distancia desde `src/` y desde `dist/`). */
export const RUTA_LISTA_TERMINOS_PROHIBIDOS = new URL(
  '../../clinical-catalogs/lenguaje/terminos-prohibidos.json',
  import.meta.url,
);

const texto = z.string().min(1);
const idioma = z.enum(['es', 'en']);
const aplicaA = z.array(z.string().min(1));

const termino = z
  .object({
    id: texto,
    idioma,
    texto,
    formas: z.array(texto).min(1).optional(),
    excepciones: z.array(texto).min(1).optional(),
  })
  .superRefine((valor, contexto) => {
    const base = palabrasDe(valor.texto).join(' ');
    if (valor.formas && !valor.formas.some((forma) => palabrasDe(forma).join(' ') === base)) {
      contexto.addIssue({
        code: 'custom',
        message: `formas no incluye la forma de "${valor.texto}"`,
      });
    }
    const claves = clavesDe(valor.texto);
    for (const excepcion of valor.excepciones ?? []) {
      if (posicionesDe(clavesDe(excepcion), claves).length === 0) {
        contexto.addIssue({
          code: 'custom',
          message: `la excepción "${excepcion}" no contiene "${valor.texto}"`,
        });
      }
    }
  });

const esquemaLista = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version debe ser semver'),
    normalizacion: texto,
    nivelA: z.object({ aplicaA, terminos: z.array(termino).min(1) }),
    nivelB: z.object({
      aplicaA,
      prefijos: z.array(z.object({ id: texto, idioma, prefijo: texto })).min(1),
      terminos: z.array(termino),
    }),
    frasesPermitidas: z.object({ aplicaA, frases: z.array(texto) }),
  })
  .superRefine((lista, contexto) => {
    const ids = [
      ...lista.nivelA.terminos.map((t) => t.id),
      ...lista.nivelB.terminos.map((t) => t.id),
      ...lista.nivelB.prefijos.map((p) => p.id),
    ];
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (repetidos.length > 0) {
      contexto.addIssue({
        code: 'custom',
        message: `id repetidos entre niveles: ${repetidos.join(', ')}`,
      });
    }
  });

/**
 * Valida una lista ya leída (por ejemplo, el JSON que carga `contracts:check`). Falla cerrado: lanza un error
 * que nombra el origen y los problemas del esquema.
 */
export function parseProhibitedTerms(datos: unknown, origen: string): ListaTerminos {
  const resultado = esquemaLista.safeParse(datos);
  if (!resultado.success) throw errorDeCarga(origen, motivoDeEsquema(resultado.error));
  return resultado.data;
}

/**
 * Carga y valida la lista de términos prohibidos. Falla cerrado: una lista ausente, ilegible o inválida
 * lanza un error que nombra el archivo y nunca se trata como lista vacía.
 */
export function loadProhibitedTerms(
  ruta: string | URL = RUTA_LISTA_TERMINOS_PROHIBIDOS,
): ListaTerminos {
  const archivo = ruta instanceof URL ? fileURLToPath(ruta) : ruta;
  let datos: unknown;
  try {
    datos = JSON.parse(readFileSync(archivo, 'utf8'));
  } catch (error) {
    const motivo = error instanceof Error ? error.message : 'error desconocido';
    throw errorDeCarga(archivo, motivo, error);
  }
  return parseProhibitedTerms(datos, archivo);
}

function errorDeCarga(origen: string, motivo: string, causa?: unknown): Error {
  return new Error(
    `No se pudo cargar la lista de términos prohibidos (RN-23) ${origen}: ${motivo}`,
    {
      cause: causa,
    },
  );
}

function motivoDeEsquema(error: z.ZodError): string {
  return error.issues
    .map((problema) => `${problema.path.join('.') || '(raíz)'}: ${problema.message}`)
    .join('; ');
}
