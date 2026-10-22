import 'server-only';
import type { DependenciasDelBff } from './dependencias';

export type ResultadoDeFicha = { tipo: 'no_implementado' };

/* eslint-disable @typescript-eslint/no-unused-vars -- esqueleto del rojo */
export function obtenerFicha(
  _cabeceraCookie: string | null,
  _id: string,
  _dependencias?: DependenciasDelBff,
): Promise<ResultadoDeFicha> {
  throw new Error('no implementado');
}
