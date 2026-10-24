import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashDelArchivo } from '../hash.mjs';
import { CATALOGO, PLAZO_PROCESO_MS, ejecutarValidador } from './apoyo.mjs';

const leerJson = (ruta) => JSON.parse(readFileSync(path.join(CATALOGO, ruta), 'utf8'));
const archivoDe = (tipo) => leerJson(`${tipo}/aplicabilidad.json`);
const criteriosDe = (tipo) => archivoDe(tipo).items;

const CLAVES_DE_MAMA = [
  'estado_her2',
  'receptores_hormonales',
  'estadio',
  'linea_tratamiento',
  'estado_menopausico',
  'ecog',
];
const CLAVES_DE_PROSTATA = [
  'estado_castracion',
  'extension',
  'isup',
  'linea_tratamiento',
  'ecog',
  'hrr_brca',
];
const EXCLUYENTES = ['estado_her2', 'estado_castracion'];

describe('contenido de aplicabilidad del catálogo del S3', () => {
  it('lista exactamente los criterios de mama y próstata con destination, studyKey, isExclusionary y rule [US-121 AC-1]', () => {
    const clavesDe = (tipo) =>
      criteriosDe(tipo)
        .map((criterio) => criterio.key)
        .sort();

    expect(clavesDe('mama')).toEqual([...CLAVES_DE_MAMA].sort());
    expect(clavesDe('prostata')).toEqual([...CLAVES_DE_PROSTATA].sort());
    for (const criterio of [...criteriosDe('mama'), ...criteriosDe('prostata')]) {
      expect(criterio.destination, criterio.key).toBeDefined();
      expect(criterio.studyKey, criterio.key).toEqual(expect.any(String));
      expect(criterio.rule, criterio.key).toBeDefined();
      expect(criterio.isExclusionary, criterio.key).toBe(EXCLUYENTES.includes(criterio.key));
      expect(criterio.estado, criterio.key).toBe('propuesta');
    }
  });

  it('declara el bloque validation propuesta_revisada con scope aplicabilidad y el catalogHash de sus criterios [US-121 AC-1]', () => {
    for (const tipo of ['mama', 'prostata']) {
      const { validation } = archivoDe(tipo);

      expect(validation, tipo).toMatchObject({
        scope: ['aplicabilidad'],
        status: 'propuesta_revisada',
        reviewerRole: expect.any(String),
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      expect(validation.catalogHash, tipo).toBe(
        hashDelArchivo(CATALOGO, `${tipo}/aplicabilidad.json`, ['aplicabilidad']),
      );
    }
  });

  it(
    'valida con código 0 y sin campos de puntaje en ningún criterio [US-121 AC-3]',
    () => {
      const texto = JSON.stringify([
        ...criteriosDe('mama'),
        ...criteriosDe('prostata'),
      ]).toLowerCase();

      expect(texto).not.toMatch(/"(peso|score|weight)"/);
      expect(ejecutarValidador(CATALOGO).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );
});
