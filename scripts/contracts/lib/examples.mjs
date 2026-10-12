/** Acceso a los ejemplos de `contracts/examples/` a través de `index.json`. */
import { schemaPointer } from './specs.mjs';

/**
 * Los ejemplos del índice que cumplen `predicate`, con su contenido ya parseado.
 * @returns {{ entry: any, name: string, file: string, data: any }[]}
 */
export function selectExamples(examples, predicate = () => true) {
  return (examples.index?.examples ?? [])
    .filter(predicate)
    .filter((entry) => examples.files?.[entry.file] !== undefined)
    .map((entry) => ({ entry, name: entry.file, file: `${examples.dir}/${entry.file}`, data: examples.files[entry.file] }));
}

/** Predicado: el ejemplo valida contra el schema `schemaName` de `specName`. */
export const targetsSchema = (specName, schemaName) => (entry) => entry.spec === specName && entry.target === schemaPointer(schemaName);

/** Predicado: el ejemplo es del spec `specName`. */
export const belongsTo = (specName) => (entry) => entry.spec === specName;

/** Cada objeto del ejemplo que parece una cita (tiene `chunkId`), con su puntero. */
export function* citationsIn(data, pointer = '#') {
  if (Array.isArray(data)) {
    for (const [index, item] of data.entries()) yield* citationsIn(item, `${pointer}/${index}`);
  } else if (data && typeof data === 'object') {
    if (typeof data.chunkId === 'string') yield { citation: data, pointer };
    for (const [key, value] of Object.entries(data)) yield* citationsIn(value, `${pointer}/${key}`);
  }
}
