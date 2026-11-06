import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Todos los archivos bajo un directorio, recursivamente (lo usan los tests de build sobre `.next/static`). */
export function archivos(directorio: string): string[] {
  return readdirSync(directorio).flatMap((nombre) => {
    const ruta = path.join(directorio, nombre);
    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
  });
}
