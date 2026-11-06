import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Router } from 'express';
import YAML from 'yaml';
import { esGuardiaDeOptOut } from '../../src/modules/opt-outs/rutas-genera-ia.js';
import { PREFIJO_DE_PLATAFORMA } from './rutas-y-contrato.js';

/**
 * Cobertura de las rutas `generaIA` (US-148 AC-3, DEC-22): compara tres conjuntos —las operaciones con `x-genera-ia` del
 * contrato, la lista cerrada `RUTAS_GENERA_IA` y las rutas Express que montan el guardia— y nombra por `operationId`
 * cada diferencia. Recorre las rutas REALMENTE montadas en los routers, igual que la coherencia ruta ↔ contrato.
 */

const RUTA_DEL_SPEC = resolve(fileURLToPath(new URL('../../openapi.yaml', import.meta.url)));
const METODOS = ['get', 'put', 'post', 'delete', 'patch'] as const;

export interface OperacionDelSpec {
  readonly operationId: string;
  readonly metodo: string;
  readonly ruta: string;
  readonly generaIA: boolean;
}

export function leerOperacionesDelSpec(): OperacionDelSpec[] {
  const spec = YAML.parse(readFileSync(RUTA_DEL_SPEC, 'utf8')) as {
    paths: Record<string, Record<string, { operationId?: string; 'x-genera-ia'?: boolean }>>;
  };
  return Object.entries(spec.paths).flatMap(([ruta, item]) =>
    METODOS.flatMap((metodo) => {
      const operacion = item[metodo];
      if (operacion?.operationId === undefined) return [];
      return [
        {
          operationId: operacion.operationId,
          metodo,
          ruta,
          generaIA: operacion['x-genera-ia'] === true,
        },
      ];
    }),
  );
}

interface CapaDeExpress {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] };
}

export interface RutaConGuardia {
  readonly metodo: string;
  readonly ruta: string;
  readonly conGuardia: boolean;
}

const rutaComoContrato = (rutaDeExpress: string): string =>
  `${PREFIJO_DE_PLATAFORMA}${rutaDeExpress.replace(/:(\w+)/g, '{$1}')}`;

/** Rutas planas montadas en los routers, cada una con la marca de si algún manejador es el guardia de opt-out. */
export function rutasMontadasConGuardia(routers: readonly Router[]): RutaConGuardia[] {
  return routers.flatMap((router) =>
    (router as unknown as { stack: CapaDeExpress[] }).stack.flatMap((capa) => {
      if (capa.route === undefined) return [];
      const conGuardia = capa.route.stack.some((c) => esGuardiaDeOptOut(c.handle));
      return Object.keys(capa.route.methods).map((metodo) => ({
        metodo,
        ruta: rutaComoContrato(capa.route?.path ?? ''),
        conGuardia,
      }));
    }),
  );
}

const claveDe = (metodo: string, ruta: string): string => `${metodo} ${ruta}`;

/** `operationId` (ordenados) de las operaciones del spec que tienen la ruta montada con el guardia. */
export function operacionesConGuardia(
  routers: readonly Router[],
  operaciones: readonly OperacionDelSpec[] = leerOperacionesDelSpec(),
): string[] {
  const montadas = new Set(
    rutasMontadasConGuardia(routers)
      .filter((r) => r.conGuardia)
      .map((r) => claveDe(r.metodo, r.ruta)),
  );
  return operaciones
    .filter((op) => montadas.has(claveDe(op.metodo, op.ruta)))
    .map((op) => op.operationId)
    .sort();
}

/** `operationId` (ordenados) con `x-genera-ia` en el spec. */
export function operacionesGeneraIADelSpec(
  operaciones: readonly OperacionDelSpec[] = leerOperacionesDelSpec(),
): string[] {
  return operaciones
    .filter((op) => op.generaIA)
    .map((op) => op.operationId)
    .sort();
}

/** Operaciones marcadas `generaIA` cuya ruta montada NO lleva el guardia (o no está montada): una por línea de fallo. */
export function operacionesGeneraIASinGuardia(
  routers: readonly Router[],
  operaciones: readonly OperacionDelSpec[] = leerOperacionesDelSpec(),
): string[] {
  const conGuardia = new Set(operacionesConGuardia(routers, operaciones));
  return operacionesGeneraIADelSpec(operaciones).filter((id) => !conGuardia.has(id));
}
