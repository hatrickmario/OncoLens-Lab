import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RUTA_CATALOGO_REAL } from '../../support/catalogo-terminologico.js';

interface EntradaDeCodigos {
  terminoCanonico: string;
  estandar: string;
  codigo: string;
  nombreOficial: string;
  versionFuente: string;
}

const leer = (archivo: string): string =>
  readFileSync(path.join(RUTA_CATALOGO_REAL, archivo), 'utf8');
const loincDe = (tipo: string): EntradaDeCodigos[] =>
  (JSON.parse(leer(`${tipo}/codigos.json`)) as { entradas: EntradaDeCodigos[] }).entradas.filter(
    (e) => e.estandar === 'loinc',
  );

/**
 * Códigos y LONG_COMMON_NAME verificados el 2026-11-03 en la API Clinical Tables del NLM (loinc_items v3,
 * data_version 2.83), con `isCopyrighted = false` y sin EXTERNAL_COPYRIGHT_NOTICE. HER2 queda fuera a propósito:
 * el catálogo identifica HER2 solo por nombre y el código de inmunohistoquímica no sirve para ISH.
 */
const VERIFICADOS = {
  mama: [
    ['Ki-67', '85330-9', 'Cells.Ki-67 nuclear Ag/cells in Breast cancer specimen by Immune stain'],
    ['RE', '40556-3', 'Estrogen receptor Ag [Presence] in Tissue by Immune stain'],
    ['RP', '40557-1', 'Progesterone receptor Ag [Presence] in Tissue by Immune stain'],
  ],
  prostata: [['PSA', '2857-1', 'Prostate specific Ag [Mass/volume] in Serum or Plasma']],
} as const;

describe('subconjunto mínimo de LOINC del catálogo real (DEC-04)', () => {
  it.each(Object.entries(VERIFICADOS))(
    'cada biomarcador verificado de %s tiene su entrada LOINC con nombre oficial y versión [US-110 AC-1]',
    (tipo, esperados) => {
      const entradas = loincDe(tipo);

      expect(entradas.map((e) => [e.terminoCanonico, e.codigo, e.nombreOficial])).toEqual(
        esperados.map((e) => [...e]),
      );
      for (const entrada of entradas) expect(entrada.versionFuente).toContain('LOINC 2.83');
    },
  );

  it('solo incluye biomarcadores de los datos críticos del tipo [US-110 AC-1]', () => {
    for (const tipo of ['mama', 'prostata']) {
      const criticos = (
        JSON.parse(leer(`${tipo}/datos-criticos.json`)) as {
          items: { destination: { match?: { name?: string } } }[];
        }
      ).items.map((i) => i.destination.match?.name);

      for (const entrada of loincDe(tipo)) expect(criticos).toContain(entrada.terminoCanonico);
    }
  });

  it('acompaña el subconjunto con el aviso de Regenstrief, la fuente, la fecha y la versión, y el manifest 1.3.0 [US-110 AC-1]', () => {
    const aviso = leer('NOTICE-loinc.txt');

    expect(aviso).toContain('LOINC is copyright © Regenstrief Institute, Inc.');
    expect(aviso).toContain('https://clinicaltables.nlm.nih.gov/api/loinc_items/v3/search');
    expect(aviso).toContain('2026-11-03');
    expect(aviso).toContain('2.83');
    expect((JSON.parse(leer('manifest.json')) as { version: string }).version).toBe('1.3.0');
  });
});
