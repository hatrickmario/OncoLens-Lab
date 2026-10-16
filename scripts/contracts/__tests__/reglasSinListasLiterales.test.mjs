import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { duplicadosEnListasLiterales } from './helpers/listasLiterales.mjs';

const REGLAS = path.resolve(import.meta.dirname, '../rules');
const archivosDeReglas = readdirSync(REGLAS).filter((nombre) => nombre.endsWith('.mjs'));

describe('reglas de scripts/contracts/rules', () => {
  it('no declaran listas literales de nombres de identidad ni de rutas en lugar de importarlas [Pre-S1-cierre P-8]', () => {
    const infracciones = archivosDeReglas.flatMap((nombre) =>
      duplicadosEnListasLiterales(readFileSync(path.join(REGLAS, nombre), 'utf8'), nombre).map((d) => `${nombre}:${d.linea}: ${d.elemento} (${d.motivo})`),
    );

    expect(infracciones).toEqual([]);
  });
});

describe('duplicadosEnListasLiterales', () => {
  it('nombra la regla y la línea cuando declara una lista literal de nombres de identidad', () => {
    const codigo = "export const CAMPOS = ['status',\n  'patientName', 'email'];";

    const duplicados = duplicadosEnListasLiterales(codigo, 'assertInventada.mjs');

    expect(duplicados.map((d) => [d.elemento, d.linea])).toEqual([["'patientName'", 2], ["'email'", 2]]);
  });

  it('detecta nombres compuestos en camelCase como patientEmail', () => {
    expect(duplicadosEnListasLiterales("const X = ['patientEmail'];")).toHaveLength(1);
  });

  it('detecta una ruta de lib/paths.mjs copiada en una lista', () => {
    const duplicados = duplicadosEnListasLiterales("const X = ['apps/rag-orchestrator/openapi.yaml'];");

    expect(duplicados.map((d) => d.motivo)).toEqual(['ruta conocida: importar lib/paths.mjs']);
  });

  it('detecta un patrón de identidad copiado como expresión regular', () => {
    expect(duplicadosEnListasLiterales('const X = [/^nationalid$/];')).toHaveLength(1);
  });

  it('no informa nombres de la lista blanca de identity.mjs porque no son identidad', () => {
    expect(duplicadosEnListasLiterales("const X = ['biomarkerName', 'sourceName'];")).toEqual([]);
  });

  it('no informa listas que no repiten identidad ni rutas', () => {
    expect(duplicadosEnListasLiterales("const X = ['status', 'severity', 'description'];")).toEqual([]);
  });
});
