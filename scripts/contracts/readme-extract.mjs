#!/usr/bin/env node
/** `npm run contracts:readme-extract`: reescribe el extracto no normativo de readme §4 entre sus marcadores. */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_ROOT } from './check.mjs';
import { loadContext, PATHS } from './io.mjs';
import { renderReadmeExtract, replaceReadmeExtract } from './lib/readmeExtract.mjs';

/** Escribe el extracto en el readme de `root`. Falla si faltan los marcadores. */
export async function writeReadmeExtract(root = DEFAULT_ROOT) {
  const { specs } = await loadContext(root);
  if (!specs['clinical-api'].bundled) throw new Error(`no se puede generar el extracto: ${specs['clinical-api'].error}`);
  const file = path.join(root, PATHS.readme);
  const updated = replaceReadmeExtract(await readFile(file, 'utf8'), renderReadmeExtract(specs['clinical-api'].bundled));
  if (updated === null) throw new Error(`faltan los marcadores contracts:readme-extract en ${PATHS.readme}`);
  await writeFile(file, updated);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeReadmeExtract(process.env.CONTRACTS_ROOT ?? DEFAULT_ROOT);
  console.log(`contracts:readme-extract — extracto actualizado en ${PATHS.readme}`);
}
