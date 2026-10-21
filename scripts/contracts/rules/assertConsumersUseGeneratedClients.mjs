/**
 * US-214 AC-1 [NFR-13]: el código de `apps/web` y de `apps/clinical-api` llama a `clinical-api` y a `rag-orchestrator` solo con
 * los clientes generados de `packages/api-contracts`. Un `fetch` o un cliente HTTP directo (axios, undici, node:http...) fuera
 * de los transportes declarados se reporta con archivo y línea. Los `fetch('/api/...')` del navegador hacia el BFF de `web`
 * (mismo origen) no son una llamada a un proveedor.
 *
 * Límite conocido: la detección es léxica (llamadas literales). Un alias de `fetch` (`const f = fetch; f(url)`) no se ve; la
 * protección de fondo es que los dos proveedores no publican puerto al navegador y que cada servicio inyecta su `fetch` en el
 * SDK generado, que es lo único que los tests de integración ejercitan. Falla cerrado ante un transporte declarado que ya no
 * existe: una lista blanca vieja no puede dar cobertura a un archivo que ocupa su lugar.
 */
import { reporter } from '../lib/findings.mjs';

const report = reporter('assertConsumersUseGeneratedClients', 'AC-1 · US-214 · NFR-13');

/** Transportes declarados: el único sitio de cada servicio donde se llama al `fetch` que se inyecta en el SDK generado. */
export const TRANSPORTES_DECLARADOS = [
  { file: 'apps/web/lib/server/clinical-api.ts', llamada: 'opciones.fetch(', motivo: 'fetch inyectado en el SDK generado de clinical-api (lista blanca de cabeceras, timeout, sin redirecciones)' },
];

/** Paquetes de cliente HTTP que se detectan por import, require y mención: una sola lista. */
const CLIENTES_HTTP = ['axios', 'undici', 'got', 'node-fetch', 'ky', 'superagent', 'needle'].join('|');

/** Cada patrón nombra la forma de llamada directa que detecta. */
const LLAMADAS_DIRECTAS = [
  { patron: /(?<![\w$.])fetch\s*\(/, forma: 'fetch(...)' },
  { patron: /[\w$]+\.fetch\s*\(/, forma: '<objeto>.fetch(...)' },
  { patron: /\baxios\b/, forma: 'axios' },
  { patron: /\bXMLHttpRequest\b/, forma: 'XMLHttpRequest' },
  { patron: /\bhttps?\.(?:request|get)\s*\(/, forma: 'http(s).request/get(...)' },
  { patron: new RegExp(`\\bfrom\\s+['"](?:${CLIENTES_HTTP})['"]`), forma: 'import de un cliente HTTP' },
  { patron: /\bfrom\s+['"](?:node:)?https?['"]/, forma: 'import de node:http(s)' },
  { patron: new RegExp(`\\brequire\\(\\s*['"](?:${CLIENTES_HTTP}|(?:node:)?https?)['"]\\s*\\)`), forma: 'require de un cliente HTTP' },
];

/** `fetch('/api/…')`: el navegador hablando con el BFF de su propio origen. */
const LLAMADA_AL_BFF = /(?<![\w$.])fetch\s*\(\s*['"`]\/api\//;

const esComentario = (linea) => /^\s*(?:\/\/|\/\*|\*)/.test(linea);

function llamadasDirectas(file, linea) {
  if (esComentario(linea)) return [];
  const declarada = TRANSPORTES_DECLARADOS.find((transporte) => transporte.file === file && linea.includes(transporte.llamada));
  if (declarada) return [];
  const encontrada = LLAMADAS_DIRECTAS.find(({ patron, forma }) => patron.test(linea) && !(forma === 'fetch(...)' && LLAMADA_AL_BFF.test(linea)));
  // Un hallazgo por línea: `import axios from 'axios'` casa con dos patrones y es una sola infracción.
  return encontrada ? [encontrada.forma] : [];
}

/**
 * @param {unknown} _specs
 * @param {unknown} _examples
 * @param {{ consumers?: { [file: string]: string } }} docs `consumers`: texto de cada archivo de código de los consumidores
 */
export function assertConsumersUseGeneratedClients(_specs, _examples, docs) {
  const consumers = docs?.consumers;
  // Sin `consumers` el contexto no los cargó (lo usan los tests de otras reglas); un conjunto vacío significa que no se encontró
  // ningún archivo, y eso no puede dar verde: la regla estaría apagada.
  if (!consumers) return [];
  if (Object.keys(consumers).length === 0) {
    return [report('scripts/contracts/lib/paths.mjs', 'consumerSources', 'no se encontró ningún archivo de código de los consumidores: revisa PATHS.consumerSources')];
  }
  const hallazgos = Object.entries(consumers).flatMap(([file, text]) =>
    text.split('\n').flatMap((linea, indice) =>
      llamadasDirectas(file, linea).map((forma) => report(file, `L${indice + 1}`, `llamada HTTP directa (${forma}) fuera de los transportes declarados: usa el cliente generado de packages/api-contracts (el SDK de clinical-api o de rag-orchestrator)`)),
    ),
  );
  const huerfanos = TRANSPORTES_DECLARADOS.filter(({ file, llamada }) => !(consumers[file] ?? '').includes(llamada)).map(({ file, llamada }) =>
    report(file, 'transporte declarado', `el transporte declarado ya no contiene ${llamada}: actualiza TRANSPORTES_DECLARADOS en scripts/contracts/rules/assertConsumersUseGeneratedClients.mjs`),
  );
  return [...hallazgos, ...huerfanos];
}
