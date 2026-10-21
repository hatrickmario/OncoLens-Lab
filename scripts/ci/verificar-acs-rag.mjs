#!/usr/bin/env node
/**
 * `node scripts/ci/verificar-acs-rag.mjs <resumen-ac.json> <US-xxx:n>...` (L1D-277, ARR-01 AC-3): lee el resumen por
 * `@pytest.mark.ac` que escribe scripts/ci/pytest_plugins/resumen_por_ac.py (`{"US-058 AC-1": ["passed", ...]}`), imprime
 * el resultado de los AC pedidos y sale con 1 si alguno no tiene un test ejecutado o ninguno de sus tests quedó en verde.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** `US-058:1` → clave del resumen `US-058 AC-1`. */
export const claveDelResumen = (ac) => {
  const [historia, numero] = ac.split(':');
  return `${historia} AC-${numero}`;
};

/** Estado de cada AC pedido: `sin_test` (nunca se ejecutó), `no_verde` (algún test no pasó) o `verde`. */
export function estadoDeLosAc(resumen, requeridos) {
  return requeridos.map((ac) => {
    const resultados = resumen[claveDelResumen(ac)] ?? [];
    const estado = resultados.length === 0 ? 'sin_test' : resultados.every((r) => r === 'passed') ? 'verde' : 'no_verde';
    return { ac: claveDelResumen(ac), estado, tests: resultados.length };
  });
}

function main(argumentos) {
  const [archivo, ...requeridos] = argumentos;
  if (!archivo || requeridos.length === 0) {
    console.error('uso: node scripts/ci/verificar-acs-rag.mjs <resumen-ac.json> <US-xxx:n>...');
    return 2;
  }
  const estados = estadoDeLosAc(JSON.parse(readFileSync(archivo, 'utf8')), requeridos);
  estados.forEach(({ ac, estado, tests }) => console.log(`AC requerido ${ac}: ${estado} (${tests} test(s))`));
  const fallidos = estados.filter(({ estado }) => estado !== 'verde');
  fallidos.forEach(({ ac, estado }) => console.error(`integracion-rag — ${ac} no está en verde: ${estado}`));
  return fallidos.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
