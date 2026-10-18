import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RAIZ_WEB = fileURLToPath(new URL('../..', import.meta.url));
const IGNORADOS = new Set(['node_modules', '.next', 'coverage']);
const ESTE_ARCHIVO = fileURLToPath(import.meta.url);

// Armados por partes para que este archivo no contenga los literales completos.
const PROHIBIDOS = [
  ['requiere validación clínica', 'independiente por el oncólogo tratante'].join(' '),
  ['requiere validación clínica', 'del oncólogo tratante'].join(' '),
];

function archivosDe(directorio: string): string[] {
  return readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    if (IGNORADOS.has(entrada.name)) return [];
    const ruta = path.join(directorio, entrada.name);
    return entrada.isDirectory() ? archivosDe(ruta) : [ruta];
  });
}

describe('Aviso de IA (RN-19, design D3)', () => {
  it('no aparece como literal en ningún archivo de apps/web cuando se recorren sus fuentes [US-069 AC-2]', () => {
    const conLiteral = archivosDe(RAIZ_WEB)
      .filter((ruta) => ruta !== ESTE_ARCHIVO)
      .filter((ruta) => {
        const contenido = readFileSync(ruta, 'utf8');
        return PROHIBIDOS.some((literal) => contenido.includes(literal));
      })
      .map((ruta) => path.relative(RAIZ_WEB, ruta));

    expect(conLiteral).toEqual([]);
  });
});
