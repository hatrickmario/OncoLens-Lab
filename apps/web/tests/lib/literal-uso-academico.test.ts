import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mensajes } from '../../lib/mensajes';

const RAIZ_WEB = fileURLToPath(new URL('../..', import.meta.url));
const IGNORADOS = new Set(['node_modules', '.next', 'coverage']);

function archivosDe(directorio: string): string[] {
  return readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    if (IGNORADOS.has(entrada.name)) return [];
    const ruta = path.join(directorio, entrada.name);
    return entrada.isDirectory() ? archivosDe(ruta) : [ruta];
  });
}

describe('Etiqueta de uso académico (RN-19, design D10)', () => {
  it('vive solo en messages/es.json cuando se recorren los archivos de apps/web [US-069 AC-3]', () => {
    const literal = mensajes().app.academicUseLabel;
    const propietario = path.join(RAIZ_WEB, 'messages', 'es.json');

    const conLiteral = archivosDe(RAIZ_WEB)
      .filter((ruta) => ruta !== propietario)
      .filter((ruta) => readFileSync(ruta, 'utf8').includes(literal))
      .map((ruta) => path.relative(RAIZ_WEB, ruta));

    expect(conLiteral).toEqual([]);
    expect(readFileSync(propietario, 'utf8')).toContain(literal);
  });
});
