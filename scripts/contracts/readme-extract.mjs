#!/usr/bin/env node
/** `npm run contracts:readme-extract`: reescribe el extracto no normativo de readme §4 entre sus marcadores. */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadContext } from './io.mjs';
import { DEFAULT_ROOT, PATHS } from './lib/paths.mjs';
import { renderReadmeExtract, replaceReadmeExtract } from './lib/readmeExtract.mjs';
import { CLINICAL_API } from './lib/specs.mjs';

/** Escribe el extracto en el readme de `root`. Falla si faltan los marcadores. */
export async function writeReadmeExtract(root = DEFAULT_ROOT) {
  const { specs } = await loadContext(root);
  if (!specs[CLINICAL_API].bundled) throw new Error(`no se puede generar el extracto: ${specs[CLINICAL_API].error}`);
  const file = path.join(root, PATHS.readme);
  const updated = replaceReadmeExtract(await readFile(file, 'utf8'), renderReadmeExtract(specs[CLINICAL_API].bundled));
  if (updated === null) throw new Error(`faltan los marcadores contracts:readme-extract en ${PATHS.readme}`);
  await writeFile(file, updated);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeReadmeExtract(process.env.CONTRACTS_ROOT ?? DEFAULT_ROOT);
  console.log(`contracts:readme-extract — extracto actualizado en ${PATHS.readme}`);
}
