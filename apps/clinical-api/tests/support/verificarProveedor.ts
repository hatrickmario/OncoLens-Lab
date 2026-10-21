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

export interface OpcionesDelClienteVerificado {
  /**
   * Rutas de prueba que NO existen en el contrato (p. ej. una ruta protegida de mentira para probar el guard). Se
   * declaran una por una: cualquier otra ruta que el spec no resuelva falla cerrado.
   */
  readonly rutasAjenasAlContrato?: readonly string[];
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

function verificadorDe(metodo: Metodo, ruta: string): (respuesta: Response) => void {
  return (respuesta) => {
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
  const ajenas = new Set(opciones.rutasAjenasAlContrato ?? []);
  const cliente = request(app);
  const metodoVerificado = (metodo: Metodo) => (ruta: string) => {
    const peticion = cliente[metodo](ruta);
    return ajenas.has(sinQuery(ruta)) ? peticion : peticion.expect(verificadorDe(metodo, ruta));
  };
  return Object.fromEntries(METODOS.map((metodo) => [metodo, metodoVerificado(metodo)])) as ClienteVerificado;
}
