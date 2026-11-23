import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGO } from './apoyo.mjs';

/**
 * Contenido de `sinonimos.json` (L1D-335, US-277, revisión clínica S-1…S-5 de `backlog/sprints/S7-revision-clinica.md`
 * §2.2). Son pruebas de datos sobre el catálogo real: la lista es provisional (`revision_provisional`, rol `ia`) y no
 * equivale a la validación de un oncólogo.
 */
const leer = (ruta) => JSON.parse(readFileSync(path.join(CATALOGO, ruta), 'utf8'));
const manifiesto = leer('manifest.json');
const sinonimosDe = (tipo) => leer(`${tipo}/sinonimos.json`);
const terminoDe = (tipo, canonico) =>
  sinonimosDe(tipo).items.find((item) => item.terminoCanonico === canonico);
const relacionDe = (tipo, canonico, texto) =>
  terminoDe(tipo, canonico)?.sinonimos.find((s) => s.texto === texto)?.relacion;

const PROCEDIMIENTOS_MINIMOS = [
  ['prostata', 'prostatectomía radical'],
  ['prostata', 'radioterapia externa'],
  ['prostata', 'braquiterapia'],
  ['prostata', 'vigilancia activa'],
  ['mama', 'mastectomía'],
  ['mama', 'cirugía conservadora de mama'],
];

/** Texto más estrecho que su canónico (S-1, design D1): miembro de clase y no equivalente. */
const MAS_ESTRECHOS = [
  ['prostata', 'radioterapia externa', 'IMRT'],
  ['prostata', 'radioterapia externa', 'radioterapia de intensidad modulada'],
  ['prostata', 'prostatectomía radical', 'prostatectomía radical robótica'],
  ['prostata', 'terapia de privación androgénica', 'análogos de LHRH'],
  ['prostata', 'terapia de privación androgénica', 'castración médica'],
  ['prostata', 'terapia de privación androgénica', 'bloqueo androgénico'],
  ['prostata', 'braquiterapia', 'implante de semillas'],
  ['mama', 'cirugía conservadora de mama', 'cuadrantectomía'],
  ['mama', 'cirugía conservadora de mama', 'tumorectomía'],
  ['mama', 'cirugía conservadora de mama', 'lumpectomía'],
  ['mama', 'mastectomía', 'mastectomía total'],
];

describe('sinonimos.json · contenido del catálogo real (L1D-335, US-277)', () => {
  it('el manifiesto declara sinonimos para mama y próstata [US-277 AC-1]', () => {
    expect(manifiesto.sinonimos).toEqual(['mama', 'prostata']);
  });

  it('contiene los seis procedimientos mínimos en español e inglés [US-277 AC-1]', () => {
    for (const [tipo, canonico] of PROCEDIMIENTOS_MINIMOS) {
      const equivalentes = (terminoDe(tipo, canonico)?.sinonimos ?? []).filter(
        (s) => s.relacion === 'equivalente',
      );

      expect(equivalentes.length, `${tipo}/${canonico}`).toBeGreaterThan(0);
      expect(
        equivalentes.some((s) => s.idioma === 'en'),
        `${tipo}/${canonico} en inglés`,
      ).toBe(true);
    }
  });

  it('toda entrada nueva o corregida lleva revision_provisional de rol ia [US-277 AC-1]', () => {
    for (const tipo of ['mama', 'prostata']) {
      for (const item of sinonimosDe(tipo).items) {
        expect(item.revision_provisional, `${tipo}/${item.terminoCanonico}`).toEqual({
          rol: 'ia',
          fecha: '2026-11-21',
        });
      }
    }
  });

  it('doble bloqueo anti-HER2 es término propio y no equivalente de pertuzumab [US-277 AC-1]', () => {
    const pertuzumab = terminoDe('mama', 'pertuzumab');
    const propio = terminoDe('mama', 'doble bloqueo anti-HER2');

    expect(propio?.sinonimos).toContainEqual({
      texto: 'dual HER2 blockade',
      idioma: 'en',
      relacion: 'equivalente',
    });
    expect(pertuzumab?.sinonimos.length).toBeGreaterThan(0);
    expect(pertuzumab?.sinonimos.filter((s) => s.relacion === 'equivalente')).toEqual([]);
    expect(relacionDe('mama', 'pertuzumab', 'doble bloqueo anti-HER2')).toBe('mas_amplio');
  });

  it('leuprolide es equivalente de leuprorelina [US-277 AC-1]', () => {
    expect(relacionDe('prostata', 'leuprorelina', 'leuprolide')).toBe('equivalente');
  });

  it('vigilancia activa y espera vigilante son términos distintos [US-277 AC-1]', () => {
    const items = sinonimosDe('prostata').items;
    const textosEquivalentes = (canonico) => [
      canonico,
      ...terminoDe('prostata', canonico)
        .sinonimos.filter((s) => s.relacion === 'equivalente')
        .map((s) => s.texto),
    ];

    expect(textosEquivalentes('vigilancia activa')).not.toContain('espera vigilante');
    expect(textosEquivalentes('espera vigilante')).not.toContain('vigilancia activa');
    expect(items.map((i) => i.terminoCanonico)).toEqual(
      expect.arrayContaining(['vigilancia activa', 'espera vigilante', 'orquiectomía bilateral']),
    );
    expect(textosEquivalentes('terapia de privación androgénica')).not.toContain(
      'orquiectomía bilateral',
    );
  });

  it('ningún sinónimo añadido es una sigla de dos letras [US-277 AC-1]', () => {
    const SIGLAS_YA_PUBLICADAS = ['ER', 'PR'];
    const siglas = ['mama', 'prostata']
      .flatMap((tipo) => sinonimosDe(tipo).items.flatMap((i) => i.sinonimos.map((s) => s.texto)))
      .filter((texto) => /^[A-Za-z]{2}$/.test(texto));

    expect(siglas.filter((sigla) => !SIGLAS_YA_PUBLICADAS.includes(sigla))).toEqual([]);
  });

  it('un texto más estrecho que su canónico es miembro_de_clase y no equivalente [US-277 AC-1]', () => {
    for (const [tipo, canonico, texto] of MAS_ESTRECHOS) {
      expect(relacionDe(tipo, canonico, texto), `${tipo}/${canonico}/${texto}`).toBe(
        'miembro_de_clase',
      );
      expect(
        terminoDe(tipo, canonico).sinonimos.some((s) => s.relacion === 'equivalente'),
        `${canonico} conserva un equivalente`,
      ).toBe(true);
    }
  });

  it('un texto más amplio que su canónico es mas_amplio y no equivalente [US-277 AC-1]', () => {
    expect(relacionDe('prostata', 'espera vigilante', 'observación')).toBe('mas_amplio');
    expect(relacionDe('prostata', 'resistente a la castración', 'hormonorrefractario')).toBe(
      'mas_amplio',
    );
  });

  it('las clases de fármacos declaran sus miembros como miembro_de_clase y su nombre en inglés como equivalente [US-277 AC-1]', () => {
    expect(relacionDe('mama', 'inhibidores de aromatasa', 'letrozol')).toBe('miembro_de_clase');
    expect(relacionDe('mama', 'inhibidores de aromatasa', 'aromatase inhibitor')).toBe(
      'equivalente',
    );
    expect(relacionDe('mama', 'antraciclinas', 'doxorrubicina')).toBe('miembro_de_clase');
    expect(relacionDe('mama', 'antraciclinas', 'anthracyclines')).toBe('equivalente');
    expect(relacionDe('mama', 'inhibidores de CDK4/6', 'palbociclib')).toBe('miembro_de_clase');
    expect(
      relacionDe('prostata', 'inhibidores de la vía del receptor androgénico', 'enzalutamida'),
    ).toBe('miembro_de_clase');
  });
});
