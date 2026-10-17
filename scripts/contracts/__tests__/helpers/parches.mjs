/** Ayudas de los tests de reglas: contexto real, aplicación de parches (JSON Patch y texto) y lectura de los casos. */
import jsonpatch from 'fast-json-patch';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadContext } from '../../io.mjs';
import { buildContext } from '../../lib/context.mjs';

export const ROOT = path.resolve(import.meta.dirname, '../../../..');
const PATCH_DIR = path.join(import.meta.dirname, '../../__fixtures__/parches');

let realContext;
/** Los contratos reales del repositorio, leídos una sola vez. */
export async function realContracts() {
  realContext ??= await loadContext(ROOT);
  return realContext;
}

/** Operación propia de los parches: reemplaza un fragmento dentro de una cadena del documento. */
function replaceText(document, operation) {
  const current = jsonpatch.getValueByPointer(document, operation.path);
  if (typeof current !== 'string' || !current.includes(operation.buscar)) {
    throw new Error(`replace-text: "${operation.buscar}" no está en ${operation.path}`);
  }
  return { op: 'replace', path: operation.path, value: current.replace(operation.buscar, operation.reemplazar) };
}

/**
 * Un segmento `[file=<nombre>]` en la ruta de un parche del índice de ejemplos se resuelve por el campo `file` de la
 * entrada, no por su posición: añadir ejemplos al índice no desplaza los parches. Falla si el archivo no está.
 */
function resolveIndexEntries(document, operation) {
  const match = /\[file=([^\]]+)\]/.exec(operation.path);
  if (!match) return operation;
  const position = document.examples.findIndex((entry) => entry.file === match[1]);
  if (position === -1) throw new Error(`parche: el índice no tiene ninguna entrada con file="${match[1]}"`);
  return { ...operation, path: operation.path.replace(match[0], String(position)) };
}

function applyOperations(document, operations) {
  const target = structuredClone(document);
  for (const rawOperation of operations) {
    const operation = resolveIndexEntries(target, rawOperation);
    jsonpatch.applyOperation(target, operation.op === 'replace-text' ? replaceText(target, operation) : operation, true, true);
  }
  return target;
}

/** Operaciones de texto sobre un documento Markdown. */
function applyTextOperations(text, operations) {
  return operations.reduce((current, operation) => {
    if (operation.op === 'text-replace') {
      if (!current.includes(operation.buscar)) throw new Error(`text-replace: "${operation.buscar}" no está en el documento`);
      return operation.todas ? current.replaceAll(operation.buscar, operation.reemplazar) : current.replace(operation.buscar, () => operation.reemplazar);
    }
    if (operation.op === 'text-delete-line') {
      const kept = current.split('\n').filter((line) => !line.includes(operation.contiene));
      if (kept.length === current.split('\n').length) throw new Error(`text-delete-line: ninguna línea contiene "${operation.contiene}"`);
      return kept.join('\n');
    }
    throw new Error(`operación de texto desconocida: ${operation.op}`);
  }, text);
}

/** Documentos que un parche puede reescribir: `doc:<nombre>` → ruta dentro de `docs`. */
const DOCS = {
  'data-model': ['dataModel'],
  readme: ['readme'],
  'tipos-clinical-api': ['generatedTypes', 'clinical-api'],
  'tipos-rag-orchestrator': ['generatedTypes', 'rag-orchestrator'],
};

/** Aplica un parche a las partes crudas del contexto (sin empaquetar todavía). */
function applyPatch(parts, patch) {
  const [kind, name] = patch.destino.split(':');
  if (kind === 'ejemplo') parts.examples.files[name] = applyOperations(parts.examples.files[name], patch.operaciones);
  else if (kind === 'indice') parts.examples.index = applyOperations(parts.examples.index, patch.operaciones);
  else if (kind === 'catalogo') {
    // `catalogo:terminos-prohibidos`: la lista de RN-23 (US-068); `ausente` la retira como si el archivo no existiera.
    parts.docs.terminosProhibidos = patch.ausente ? null : applyOperations(parts.docs.terminosProhibidos, patch.operaciones);
  }
  else if (kind === 'doc') {
    const doc = DOCS[name].reduce((holder, key) => holder[key], parts.docs);
    doc.text = applyTextOperations(doc.text, patch.operaciones);
  }
  else if (patch.ausente) parts.specs[kind] = { file: parts.specs[kind].file, raw: null, error: 'archivo ausente' };
  else parts.specs[kind].raw = applyOperations(parts.specs[kind].raw, patch.operaciones);
}

/**
 * El contexto real con los parches aplicados sobre una copia; nunca se escribe en el repositorio.
 * `destino` es un spec (`clinical-api`, `rag-orchestrator`, `evidence`), `ejemplo:<archivo>`, `indice`,
 * `doc:data-model`, `doc:readme` o `catalogo:terminos-prohibidos`.
 */
export function patchedContracts(base, patches) {
  const parts = {
    specs: Object.fromEntries(Object.entries(base.specs).map(([name, entry]) => [name, { file: entry.file, raw: structuredClone(entry.raw), error: entry.error }])),
    examples: structuredClone(base.examples),
    docs: structuredClone(base.docs),
  };
  patches.forEach((patch) => applyPatch(parts, patch));
  return buildContext(parts);
}

/** Todos los casos de `__fixtures__/parches/*.json`, con el archivo de origen. */
export function readCases() {
  return readdirSync(PATCH_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap((name) => JSON.parse(readFileSync(path.join(PATCH_DIR, name), 'utf8')).map((caso) => ({ ...caso, fixture: name })));
}
