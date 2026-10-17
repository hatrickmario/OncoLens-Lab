import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RUTA_DEL_CATALOGO } from '../../support/seed.js';

const RAIZ_APP = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

function archivosTs(ruta: string): string[] {
  if (statSync(ruta).isFile()) return [ruta];
  return readdirSync(ruta).flatMap((nombre) => archivosTs(join(ruta, nombre)));
}

describe('Catálogo y seed', () => {
  it('cada estándar declarado en el manifest tiene su NOTICE [US-039 AC-4]', () => {
    const { standards } = JSON.parse(
      readFileSync(join(RUTA_DEL_CATALOGO, 'manifest.json'), 'utf8'),
    ) as { standards: string[] };

    for (const estandar of standards) {
      expect(existsSync(join(RUTA_DEL_CATALOGO, `NOTICE-${estandar}.txt`)), estandar).toBe(true);
    }
  });

  it('el seed no contiene literales con forma de código CIE-10, LOINC o ATC [US-039 AC-4]', () => {
    // CIE-10 (C50.9), ATC (L02AE02) y LOINC (2857-1); la hora 'T12:00' de un literal ISO no es un código.
    const formasDeCodigo = [
      /\b[A-TV-Z]\d{2}(\.\d{1,2})?\b(?!:)/,
      /\b[A-Z]\d{2}[A-Z]{2}\d{2}\b/,
      /\b\d{3,5}-\d\b/,
    ];
    const fuentes = [join(RAIZ_APP, 'prisma/seed.ts'), join(RAIZ_APP, 'prisma/seed')].flatMap(
      archivosTs,
    );

    for (const archivo of fuentes) {
      const texto = readFileSync(archivo, 'utf8');
      for (const forma of formasDeCodigo) {
        expect(texto, `${archivo} ${forma}`).not.toMatch(forma);
      }
    }
  });
});
