import { randomBytes } from 'node:crypto';
import type { TestProject } from 'vitest/node';
import { crearBaseDeTest, leerConfiguracionArnes } from './db.js';

declare module 'vitest' {
  export interface ProvidedContext {
    /** URL de la base de test migrada de esta ejecución (contiene credenciales: no se imprime). */
    urlBaseDeTest: string;
  }
}

/** Generador del sufijo de la base (el único aleatorio del arnés, en el borde: el resto lo recibe inyectado). */
const generarSufijo = (): string => randomBytes(6).toString('hex');

/** Una base `${PG_TEST_DB_PREFIX}<id>` por ejecución: se crea y migra aquí y se elimina al terminar. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const config = leerConfiguracionArnes(process.env);
  const base = await crearBaseDeTest(config, generarSufijo());
  project.provide('urlBaseDeTest', base.url);
  return base.destruir;
}
