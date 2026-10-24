import { readFileSync } from 'node:fs';
import { http, HttpResponse, type HttpHandler } from 'msw';

/**
 * Handler de MSW construido desde un ejemplo de `contracts/examples/` (ADR-26, US-213 AC-10): un mock no puede divergir
 * del contrato. `sobrescribir` ajusta valores del ejemplo (un estado, un puntaje) pero NO puede inventar campos: una clave
 * ausente en el ejemplo es un campo que el contrato no describe y hace fallar el test que lo usa.
 */

const CARPETA_DE_EJEMPLOS = new URL('../../../contracts/examples/', import.meta.url);

type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Objeto = Record<string, unknown>;

export interface Operacion {
  readonly metodo: Metodo;
  /** URL completa o patrón de MSW (p. ej. `http://rag-orchestrator:8000/rag/query`). */
  readonly url: string;
}

export interface OpcionesDelHandler {
  /** Valores a cambiar en el ejemplo, anidados como el ejemplo; cada clave debe existir en él. */
  readonly sobrescribir?: Objeto;
  readonly status?: number;
  /** Observa cada petición recibida (cabeceras, cuerpo) sin alterar la respuesta. */
  readonly alRecibir?: (peticion: Request) => void | Promise<void>;
}

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

/** Carga el ejemplo por su nombre de archivo; un nombre inexistente falla nombrándolo. */
export function cargarEjemplo(archivoDeEjemplo: string): unknown {
  try {
    return JSON.parse(readFileSync(new URL(archivoDeEjemplo, CARPETA_DE_EJEMPLOS), 'utf8'));
  } catch (error) {
    throw new Error(
      `handlerDesdeEjemplo: no se pudo leer el ejemplo ${archivoDeEjemplo} de contracts/examples/ (${(error as Error).message})`,
    );
  }
}

/** Aplica `sobrescribir` sobre una copia del ejemplo; lanza nombrando el campo y el ejemplo si la clave no existe. */
export function aplicarSobrescritura(
  base: unknown,
  sobrescribir: Objeto,
  archivoDeEjemplo: string,
  ruta = '',
): unknown {
  if (!esObjeto(base)) {
    throw new Error(
      `handlerDesdeEjemplo: el campo "${ruta}" no es un objeto en el ejemplo ${archivoDeEjemplo}`,
    );
  }
  const resultado: Objeto = { ...base };
  for (const [clave, valor] of Object.entries(sobrescribir)) {
    const campo = ruta === '' ? clave : `${ruta}.${clave}`;
    if (!Object.hasOwn(base, clave)) {
      throw new Error(
        `handlerDesdeEjemplo: el campo "${campo}" no existe en el ejemplo ${archivoDeEjemplo}`,
      );
    }
    resultado[clave] =
      esObjeto(valor) && esObjeto(base[clave])
        ? aplicarSobrescritura(base[clave], valor, archivoDeEjemplo, campo)
        : valor;
  }
  return resultado;
}

export function handlerDesdeEjemplo(
  operacion: Operacion,
  archivoDeEjemplo: string,
  opciones: OpcionesDelHandler = {},
): HttpHandler {
  const ejemplo = cargarEjemplo(archivoDeEjemplo);
  // Se valida al construir el handler, no al atender: el test falla en su arranque y no depende de que la petición ocurra.
  const cuerpo = opciones.sobrescribir
    ? aplicarSobrescritura(ejemplo, opciones.sobrescribir, archivoDeEjemplo)
    : ejemplo;
  return http[operacion.metodo](operacion.url, async ({ request }) => {
    await opciones.alRecibir?.(request.clone());
    return HttpResponse.json(cuerpo as Objeto, { status: opciones.status ?? 200 });
  });
}
