import { z } from 'zod';
import { ConfiguracionInvalidaError } from '../../../config.js';

/**
 * Configuración del enmascarado de PII en ejecución (RN-11, RN-22). Los FORMATOS (documento con palabra clave,
 * teléfono, correo) salen solo de `config/pii-formats.json` (L1D-166, fuente única); aquí se añaden únicamente las
 * reglas de reemplazo de `pii-masks.json`. Un archivo ausente o inválido, un `tipo` sin marcador o una
 * `formatsVersion` distinta de la `version` de L1D-166 impiden arrancar (fallo cerrado); el error nombra la variable y
 * nunca la ruta ni el contenido.
 *
 * Las exenciones de `pii-formats.json` (`prefijosExentos`, `contextosExentos`, `prefijosDeRegistroExentos`,
 * `dominiosExentos`, `correosExentos`) son del escáner de la CI, pensadas para documentos públicos: aquí NO se leen,
 * de modo que el texto clínico de un paciente se enmascara aunque lleve el prefijo `SINT-`, un dominio `example.com`
 * o un identificador `NCT…`. Sí se respetan los límites de dígitos (`digitosMin`/`digitosMax`), que son parte de la
 * definición del formato y evitan enmascarar números clínicos cortos.
 */

const MAXIMO_DE_CARACTERES_DE_UNA_SIGLA = 4;

export type EtapaDeEnmascarado = 'identidad' | 'fechas' | 'formatos';

export interface FormatoDePii {
  id: string;
  /** `tipo` de L1D-166 (`documento_identidad`, `telefono`, `correo`): lo que aparece en `findingTypes`. */
  tipo: string;
  /** Con banderas global y de índices (`gd`): `indices.groups.valor` da el rango a sustituir. */
  expresion: RegExp;
  marcador: string;
  digitosMin: number;
  digitosMax: number;
}

export interface MarcadoresDeIdentidad {
  nombre: string;
  documento: string;
  telefono: string;
}

export interface ReglaDeFechas {
  marcador: string;
  /** Con banderas global y de índices. */
  expresiones: RegExp[];
}

export interface ConfiguracionDePii {
  formatos: FormatoDePii[];
  marcadoresDeIdentidad: MarcadoresDeIdentidad;
  fechas: ReglaDeFechas;
  orden: EtapaDeEnmascarado[];
  /** `PII_NAME_TOKEN_MIN_LENGTH`: los tokens de nombre más cortos no se enmascaran (partículas). */
  nameTokenMinLength: number;
}

export interface RutasDeConfiguracionDePii {
  formatsPath: string;
  masksPath: string;
  nameTokenMinLength: number;
}

const esquemaDeFormatos = z.object({
  version: z.number().int().positive(),
  formatos: z
    .array(
      z.object({
        id: z.string().min(1),
        tipo: z.string().min(1),
        patron: z.string().min(1),
        banderas: z.string().optional(),
        palabrasClave: z.array(z.string().min(1)).optional(),
        digitosMin: z.number().int().nonnegative().optional(),
        digitosMax: z.number().int().positive().optional(),
      }),
    )
    .min(1),
});

const ETAPAS = ['identidad', 'fechas', 'formatos'] as const;

const esquemaDeMascaras = z.object({
  version: z.number().int().positive(),
  formatsVersion: z.number().int().positive(),
  marcadores: z.record(z.string(), z.string().min(1)),
  identidad: z.object({
    nombre: z.string().min(1),
    documento: z.string().min(1),
    telefono: z.string().min(1),
  }),
  orden: z.array(z.enum(ETAPAS)).length(ETAPAS.length),
  fechas: z.object({
    marcador: z.string().min(1),
    meses: z.array(z.string().min(1)).min(1),
    banderas: z.string().optional(),
    patrones: z.array(z.string().min(1)).min(1),
  }),
});

const escaparAlternativa = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const caracteresSignificativos = (texto: string): number =>
  texto.replace(/[^\p{L}\p{N}]/gu, '').length;

/** Una sigla corta (CC, C.C., TI, ID…) exige límite de palabra; una palabra larga se reconoce también en camelCase. */
function alternativaDePalabraClave(palabra: string): string {
  const escapada = escaparAlternativa(palabra);
  return caracteresSignificativos(palabra) <= MAXIMO_DE_CARACTERES_DE_UNA_SIGLA
    ? `(?<![\\p{L}\\p{N}_])${escapada}(?![\\p{L}_])`
    : escapada;
}

function leerJson(ruta: string, variable: string, leerArchivo: (ruta: string) => string): unknown {
  try {
    return JSON.parse(leerArchivo(ruta));
  } catch {
    throw new ConfiguracionInvalidaError(variable, 'no es un archivo JSON legible');
  }
}

function analizar<T>(esquema: z.ZodType<T>, valor: unknown, variable: string): T {
  const resultado = esquema.safeParse(valor);
  if (!resultado.success) {
    throw new ConfiguracionInvalidaError(variable, 'no cumple el esquema esperado');
  }
  return resultado.data;
}

function compilar(fuente: string, banderas: string, variable: string): RegExp {
  try {
    return new RegExp(fuente, `${banderas}gd`);
  } catch {
    throw new ConfiguracionInvalidaError(variable, 'contiene una expresión regular inválida');
  }
}

/** Carga y valida `pii-formats.json` (L1D-166) y `pii-masks.json`; compila los patrones una sola vez. */
export function cargarConfiguracionDePii(
  rutas: RutasDeConfiguracionDePii,
  leerArchivo: (ruta: string) => string,
): ConfiguracionDePii {
  const formatos = analizar(
    esquemaDeFormatos,
    leerJson(rutas.formatsPath, 'PII_FORMATS_PATH', leerArchivo),
    'PII_FORMATS_PATH',
  );
  const mascaras = analizar(
    esquemaDeMascaras,
    leerJson(rutas.masksPath, 'PII_MASKS_PATH', leerArchivo),
    'PII_MASKS_PATH',
  );
  if (mascaras.formatsVersion !== formatos.version) {
    throw new ConfiguracionInvalidaError(
      'PII_MASKS_PATH',
      'formatsVersion no coincide con la version de pii-formats.json',
    );
  }
  if (new Set(mascaras.orden).size !== ETAPAS.length) {
    throw new ConfiguracionInvalidaError('PII_MASKS_PATH', 'orden debe nombrar cada etapa una vez');
  }
  const meses = mascaras.fechas.meses.map(escaparAlternativa).join('|');
  return {
    formatos: formatos.formatos.map((formato) => {
      const marcador = mascaras.marcadores[formato.tipo];
      if (marcador === undefined) {
        throw new ConfiguracionInvalidaError('PII_MASKS_PATH', 'falta el marcador de un tipo');
      }
      const palabras = (formato.palabrasClave ?? []).map(alternativaDePalabraClave).join('|');
      return {
        id: formato.id,
        tipo: formato.tipo,
        expresion: compilar(
          formato.patron.replace('{{palabrasClave}}', palabras),
          formato.banderas ?? '',
          'PII_FORMATS_PATH',
        ),
        marcador,
        digitosMin: formato.digitosMin ?? 0,
        digitosMax: formato.digitosMax ?? Number.POSITIVE_INFINITY,
      };
    }),
    marcadoresDeIdentidad: mascaras.identidad,
    fechas: {
      marcador: mascaras.fechas.marcador,
      expresiones: mascaras.fechas.patrones.map((patron) =>
        compilar(
          patron.replace('{{meses}}', meses),
          mascaras.fechas.banderas ?? '',
          'PII_MASKS_PATH',
        ),
      ),
    },
    orden: mascaras.orden,
    nameTokenMinLength: rutas.nameTokenMinLength,
  };
}
