import type { Client } from 'pg';
import { formatWithOptions } from 'node:util';
import { vi } from 'vitest';
// scripts/contracts/lib/identity.mjs se tipa por inferencia (`allowJs`): lista única de campos de identidad, no se duplica.
import { IDENTIDAD_PII, matchesIdentity } from '../../../../scripts/contracts/lib/identity.mjs';

/**
 * Arnés de no-fuga de identidad (US-046 AC-4, RN-10, NFR-11). Dueño de la regla "la identidad nunca sale de
 * clinical-api": cada salida nueva (ficha en L1D-72, búsqueda en L1D-202) añade su PASO al mismo test.
 *
 * Busca (a) los VALORES de la identidad —documento en claro, nombre, forma normalizada, índices ciegos— en el texto de
 * cada fuente y (b) CLAVES con nombre de identidad (la lista `IDENTIDAD_PII` de los contratos) en los JSON que salen.
 * La comparación ignora mayúsculas y tildes: `Lucía` y `LUCIA` son la misma fuga.
 */

export interface Fuente {
  readonly nombre: string;
  readonly texto: string;
  /**
   * `false` para filas de tablas completas: ahí las CLAVES son nombres de columna del esquema (p. ej. `ip_address`) y no
   * una fuga; las claves de lo que contienen las columnas jsonb sí se revisan, como fuentes aparte.
   */
  readonly revisarClaves?: boolean;
}

export interface Hallazgo {
  readonly fuente: string;
  readonly valor: string;
}

export interface PasoDeNoFuga {
  readonly nombre: string;
  readonly ejecutar: () => Promise<void>;
}

const sinTildesYEnMinusculas = (texto: string): string =>
  texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Valores de una identidad guardada que no pueden salir: documento y su forma con puntos, nombre completo, su forma
 * sin tildes y cada token del nombre (`Fernanda` y `Peña` incluidos), derivados de lo que hay en la fila.
 */
export function valoresDeIdentidad(identidad: {
  readonly numeroDeDocumento: string;
  readonly nombreCompleto: string;
}): string[] {
  const conPuntos = identidad.numeroDeDocumento.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const tokens = identidad.nombreCompleto.split(/\s+/);
  return [
    identidad.numeroDeDocumento,
    conPuntos,
    identidad.nombreCompleto,
    sinTildesYEnMinusculas(identidad.nombreCompleto),
    ...tokens,
  ];
}

/** Valores que no pueden aparecer en ninguna fuente. Los de menos de 4 caracteres se ignoran: darían falsos positivos. */
export function valoresProhibidos(valores: readonly string[]): string[] {
  const minimo = 4;
  return [
    ...new Set(valores.filter((valor) => valor.length >= minimo).map(sinTildesYEnMinusculas)),
  ];
}

/** Fuentes que contienen alguno de los valores, o claves de JSON con nombre de identidad. */
export function buscarFugaDeIdentidad(
  valores: readonly string[],
  fuentes: readonly Fuente[],
): Hallazgo[] {
  const buscados = valoresProhibidos(valores);
  const hallazgos: Hallazgo[] = [];
  for (const fuente of fuentes) {
    const texto = sinTildesYEnMinusculas(fuente.texto);
    for (const valor of buscados) {
      if (texto.includes(valor)) hallazgos.push({ fuente: fuente.nombre, valor });
    }
    if (fuente.revisarClaves === false) continue;
    for (const clave of clavesDeIdentidadEnJson(fuente.texto)) {
      hallazgos.push({ fuente: fuente.nombre, valor: `clave:${clave}` });
    }
  }
  return hallazgos;
}

/** Claves (a cualquier profundidad) de los JSON embebidos en el texto cuyo nombre es de identidad según `IDENTIDAD_PII`. */
export function clavesDeIdentidadEnJson(texto: string): string[] {
  const claves = new Set<string>();
  const recorrer = (valor: unknown): void => {
    if (Array.isArray(valor)) valor.forEach(recorrer);
    else if (valor !== null && typeof valor === 'object') {
      for (const [clave, contenido] of Object.entries(valor)) {
        if (matchesIdentity(clave, IDENTIDAD_PII)) claves.add(clave);
        recorrer(contenido);
      }
    }
  };
  try {
    recorrer(JSON.parse(texto));
  } catch {
    // No es un JSON completo (una línea de log, un texto): solo se busca por valores.
  }
  return [...claves];
}

/** La Base del análisis que sale hacia el navegador (US-066, RN-10): una fuente más para el arnés, con sus claves. */
export function fuenteDeLaBaseDelAnalisis(base: unknown): Fuente {
  return { nombre: 'respuesta:analysisBasis', texto: JSON.stringify(base) };
}

/**
 * Etiquetas de `patientDataUsed` que traen una fecha absoluta (con las mismas expresiones que `verificarDesidentificado`,
 * de `config/pii-formats.json`) o el seudónimo de la consulta (RN-10, RN-11).
 */
export function etiquetasConDatoAbsoluto(
  etiquetas: readonly string[],
  seudonimo: string,
  expresionesDeFecha: readonly RegExp[],
): string[] {
  return etiquetas.filter(
    (etiqueta) =>
      etiqueta.includes(seudonimo) ||
      expresionesDeFecha.some((expresion) => etiqueta.search(expresion) !== -1),
  );
}

const TABLAS_DE_SALIDA = [
  { esquema: 'audit', tabla: null },
  { esquema: 'research', tabla: null },
  { esquema: 'clinical', tabla: 'ai_analysis_record' },
] as const;

/** Cada fila de `audit.*`, `research.*` y `clinical.ai_analysis_record` como JSON (todas sus columnas, no solo texto). */
export async function fuentesDeBaseDeDatos(cliente: Client): Promise<Fuente[]> {
  const fuentes: Fuente[] = [];
  for (const { esquema, tabla } of TABLAS_DE_SALIDA) {
    const { rows: tablas } = await cliente.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 AND table_type = 'BASE TABLE' AND ($2::text IS NULL OR table_name = $2)
        ORDER BY table_name`,
      [esquema, tabla],
    );
    for (const { table_name: nombre } of tablas) {
      const { rows } = await cliente.query<{ fila: string }>(
        `SELECT to_jsonb(t)::text AS fila FROM ${esquema}.${nombre} t`,
      );
      for (const [indice, { fila }] of rows.entries()) {
        const nombreDeFila = `${esquema}.${nombre}[${indice}]`;
        fuentes.push({ nombre: nombreDeFila, texto: fila, revisarClaves: false });
        fuentes.push(...columnasJson(nombreDeFila, fila));
      }
    }
  }
  return fuentes;
}

/** Cada columna jsonb de la fila como fuente propia, para revisar también las claves de su contenido. */
function columnasJson(nombreDeFila: string, fila: string): Fuente[] {
  return Object.entries(JSON.parse(fila) as Record<string, unknown>)
    .filter(([, valor]) => valor !== null && typeof valor === 'object')
    .map(([columna, valor]) => ({
      nombre: `${nombreDeFila}.${columna}`,
      texto: JSON.stringify(valor),
    }));
}

export interface EntradaDelArnes {
  readonly pasos: readonly PasoDeNoFuga[];
  /** Valores de identidad, ya conocidos tras ejecutar los pasos (p. ej. los índices ciegos leídos de la fila). */
  readonly valores: () => Promise<readonly string[]>;
  /** Fuentes a revisar tras los pasos: logs, tablas y payloads capturados. */
  readonly fuentes: () => Promise<readonly Fuente[]>;
}

/** Ejecuta los pasos en orden y devuelve lo que encontró; vacío significa que no hubo fuga. */
export async function ejecutarArnesDeNoFuga(entrada: EntradaDelArnes): Promise<Hallazgo[]> {
  for (const paso of entrada.pasos) await paso.ejecutar();
  return buscarFugaDeIdentidad(await entrada.valores(), await entrada.fuentes());
}

export interface CapturaDeSalida {
  /** Cada escritura del proceso en orden, como texto. */
  readonly salida: string[];
  restaurar: () => void;
}

const METODOS_DE_CONSOLE = ['log', 'info', 'warn', 'error', 'debug', 'dir', 'table'] as const;

const comoTexto = (chunk: unknown): string =>
  Buffer.isBuffer(chunk) || chunk instanceof Uint8Array
    ? Buffer.from(chunk).toString('utf8')
    : String(chunk);

/** Como la consola: objetos y `Error` (con `cause` y propiedades como `detail`) a profundidad completa. */
const comoConsola = (argumentos: readonly unknown[]): string =>
  formatWithOptions(
    { depth: null },
    ...argumentos.map((argumento) =>
      argumento instanceof Uint8Array ? Buffer.from(argumento).toString('utf8') : argumento,
    ),
  );

/**
 * Borde del proceso: todo lo que clinical-api escriba con `console.*` o `process.std*.write` durante los pasos es una
 * fuente más. Vitest intercepta `console.*` con su propia consola antes de `process.stdout`, así que se espían ambos.
 */
export function capturarSalidaDelProceso(): CapturaDeSalida {
  const salida: string[] = [];
  const espias = [
    ...(['stdout', 'stderr'] as const).map((flujo) =>
      vi.spyOn(process[flujo], 'write').mockImplementation((chunk: unknown) => {
        salida.push(comoTexto(chunk));
        return true;
      }),
    ),
    ...METODOS_DE_CONSOLE.map((metodo) =>
      vi.spyOn(console, metodo).mockImplementation((...argumentos: unknown[]) => {
        salida.push(comoConsola(argumentos));
      }),
    ),
  ];
  return { salida, restaurar: () => espias.forEach((espia) => espia.mockRestore()) };
}
