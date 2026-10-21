import { appendFileSync } from 'node:fs';
import type { Express } from 'express';
import request, { type Response, type Test } from 'supertest';
import { verificarRespuesta } from '../../../../scripts/contracts/lib/responseValidator.mjs';

/**
 * Verificación del proveedor (US-214 AC-1…AC-3, design D1): envuelve `supertest(app)` y valida CADA respuesta contra
 * `apps/clinical-api/openapi.yaml` (código declarado, cabeceras obligatorias y cuerpo), sin que el test lo pida. Un
 * incumplimiento hace fallar la petición nombrando proveedor, método, plantilla, código y ruta JSON, nunca el valor.
 * Usa el mismo validador (Ajv2020) que `contracts:check`; el empaquetado lo registra `vitest/setupFile.mjs`.
 */

const PROVEEDOR = 'clinical-api';
const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type Metodo = (typeof METODOS)[number];

/** Una respuesta que el test fabrica con una ruta de mentira y que, por tanto, el contrato no describe. */
export interface RespuestaAjenaAlContrato {
  /** Ruta sin query, tal como la pide el test. */
  readonly ruta: string;
  /** Solo ese código (p. ej. el 200 de un controlador de mentira montado en una ruta real); sin él, todos los de la ruta. */
  readonly status?: number;
}

export interface OpcionesDelClienteVerificado {
  /**
   * Excepciones a la verificación, declaradas una por una: cualquier otra respuesta que el spec no describa falla
   * cerrado. Solo para rutas o controladores de prueba que existen para ejercitar el guard o el manejador de errores.
   */
  readonly respuestasAjenasAlContrato?: readonly RespuestaAjenaAlContrato[];
}

export type ClienteVerificado = Record<Metodo, (ruta: string) => Test>;

const sinQuery = (ruta: string): string => ruta.split('?', 1)[0] ?? ruta;

/** Cuerpo tal como lo ve el consumidor: JSON parseado, texto si no es JSON, `undefined` si no hay cuerpo. */
function cuerpoDe(respuesta: Response): unknown {
  if (respuesta.text === '' || respuesta.text === undefined) return undefined;
  return respuesta.type === 'application/json' ? (respuesta.body as unknown) : respuesta.text;
}

/** Deja constancia de una respuesta verificada para el reporte de `contracts:verify-provider` (una línea por respuesta). */
function registrarRespuestaVerificada(): void {
  const archivo = process.env['CONTRACT_VERIFY_REPORT'];
  if (archivo !== undefined && archivo !== '') appendFileSync(archivo, `${PROVEEDOR}\n`);
}

/** ¿El test declaró esta ruta (y este código, si lo acotó) como de mentira? */
function esRespuestaAjenaAlContrato(
  ajenas: readonly RespuestaAjenaAlContrato[],
  ruta: string,
  status: number,
): boolean {
  return ajenas.some(
    (ajena) => ajena.ruta === sinQuery(ruta) && (ajena.status ?? status) === status,
  );
}

function verificadorDe(
  metodo: Metodo,
  ruta: string,
  ajenas: readonly RespuestaAjenaAlContrato[],
): (respuesta: Response) => void {
  return (respuesta) => {
    if (esRespuestaAjenaAlContrato(ajenas, ruta, respuesta.status)) return;
    verificarRespuesta({
      proveedor: PROVEEDOR,
      metodo,
      ruta,
      status: respuesta.status,
      cabeceras: respuesta.headers,
      cuerpo: cuerpoDe(respuesta),
    });
    registrarRespuestaVerificada();
  };
}

/** `request(app)` con la verificación del proveedor activa en cada respuesta. */
export function clienteVerificado(
  app: Express,
  opciones: OpcionesDelClienteVerificado = {},
): ClienteVerificado {
  const ajenas = opciones.respuestasAjenasAlContrato ?? [];
  const cliente = request(app);
  const metodoVerificado = (metodo: Metodo) => (ruta: string) => {
    return cliente[metodo](ruta).expect(verificadorDe(metodo, ruta, ajenas));
  };
  return Object.fromEntries(
    METODOS.map((metodo) => [metodo, metodoVerificado(metodo)]),
  ) as ClienteVerificado;
}
