import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PACIENTES_SEMILLA } from '../../prisma/seed/pacientes/indice.js';

const DIRECTORIO = new URL('../../prisma/seed/pacientes/', import.meta.url);

describe('PACIENTES_SEMILLA', () => {
  it('lista un paciente por cada archivo <letra>.ts del directorio cuando se compara con el sistema de archivos', () => {
    // El E2E de `web` cuenta los pacientes por estos archivos (no puede importar clinical-api): deben coincidir.
    const claves = readdirSync(DIRECTORIO)
      .filter((archivo) => /^[a-z]\.ts$/.test(archivo))
      .map((archivo) => `paciente-${archivo.replace('.ts', '')}`)
      .sort();

    expect(PACIENTES_SEMILLA.map((paciente) => paciente.clave).sort()).toEqual(claves);
  });
});
