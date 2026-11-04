#!/usr/bin/env node
/**
 * Banderas de datos reales en la configuración efectiva de Compose (US-142 AC-3, design D4).
 *
 *   docker compose --profile seed config --format json | node scripts/gates/g-demo/banderas.mjs
 *
 * Imprime una línea JSON con SOLO las dos variables como booleano (`true` = activa o ilegible). Ningún otro valor de la
 * configuración (contraseñas, rutas, cadenas de conexión) sale de este módulo (RN-14).
 */
import { pathToFileURL } from 'node:url';
import { VARIABLES_DE_DATOS_REALES } from './solo-sintetico.mjs';

export const SERVICIOS_CON_BANDERAS = ['clinical-api', 'clinical-seed'];

const estaApagada = (valor) => valor === false || String(valor).toLowerCase() === 'false';

/** `false` solo si todos los servicios presentes la declaran apagada y `clinical-api` la declara. */
export function extraerBanderas(configCompose) {
  const servicios = configCompose?.services ?? {};
  const entornos = SERVICIOS_CON_BANDERAS.map((nombre) => servicios[nombre]?.environment).filter(
    Boolean,
  );
  const hayApi = servicios['clinical-api']?.environment !== undefined;
  return Object.fromEntries(
    VARIABLES_DE_DATOS_REALES.map((variable) => {
      const valores = entornos.map((entorno) => entorno[variable]);
      const apagada =
        hayApi && valores.length > 0 && valores.every((v) => v !== undefined && estaApagada(v));
      return [variable, !apagada];
    }),
  );
}

async function leerEntrada() {
  const trozos = [];
  for await (const trozo of process.stdin) trozos.push(trozo);
  return Buffer.concat(trozos).toString('utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(extraerBanderas(JSON.parse(await leerEntrada())))}\n`);
  } catch (error) {
    console.error(`No se pudieron leer las banderas (${error.name})`);
    process.exitCode = 1;
  }
}
