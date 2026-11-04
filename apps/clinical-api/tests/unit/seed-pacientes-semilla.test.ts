import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { idSembrado } from '../../prisma/seed/determinismo.js';
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

  it('coincide con los ids que usa el E2E de la demo del S5 para (g)–(m) cuando se derivan con idSembrado [US-254 AC-4]', () => {
    // `web` no importa código de clinical-api: el E2E repite los UUID deterministas y este test detecta una deriva.
    const soporte = readFileSync(new URL('../../../web/e2e/soporte.ts', import.meta.url), 'utf8');
    const ids = [...soporte.matchAll(/'([g-m])-[a-z0-9-]+': '([0-9a-f-]{36})'/g)];

    expect(ids).toHaveLength(7);
    for (const [, letra, id] of ids) expect(id).toBe(idSembrado(`paciente-${letra}`));
  });
});
