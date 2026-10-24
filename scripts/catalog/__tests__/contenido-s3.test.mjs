import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGO, PLAZO_PROCESO_MS, ejecutarValidador } from './apoyo.mjs';

const leerJson = (ruta) => JSON.parse(readFileSync(path.join(CATALOGO, ruta), 'utf8'));
const itemsDe = (tipo) => leerJson(`${tipo}/datos-criticos.json`).items;
const itemDe = (tipo, clave) => itemsDe(tipo).find((item) => item.key === clave);

const CLAVES_DE_MAMA = [
  'histologia',
  'grado',
  'tnm',
  're',
  'rp',
  'her2_ihq',
  'her2_ish',
  'ki67',
  'estado_menopausico',
  'ecog',
  'tratamientos_previos',
  'brca_germinal',
];
const CLAVES_DE_PROSTATA = [
  'psa_serie',
  'gleason_isup',
  'tnm',
  'sitios_metastasicos',
  'estado_castracion',
  'tratamientos_previos',
  'ecog',
  'hrr_brca',
];

describe('contenido de datos críticos del catálogo del S3', () => {
  it('lista exactamente las claves de mama y próstata con destino y estado propuesta [US-001 AC-7]', () => {
    expect(itemsDe('mama').map((item) => item.key).sort()).toEqual([...CLAVES_DE_MAMA].sort());
    expect(itemsDe('prostata').map((item) => item.key).sort()).toEqual([...CLAVES_DE_PROSTATA].sort());
    for (const item of [...itemsDe('mama'), ...itemsDe('prostata')]) {
      expect(item.destination, item.key).toBeDefined();
      expect(item.estado, item.key).toBe('propuesta');
    }
  });

  it('apunta gleason_isup a Diagnosis.grade y tnm a Diagnosis.stage_value [US-001 AC-7]', () => {
    expect(itemDe('prostata', 'gleason_isup')?.destination).toMatchObject({ entity: 'Diagnosis', field: 'grade' });
    for (const tipo of ['mama', 'prostata']) {
      expect(itemDe(tipo, 'tnm')?.destination).toMatchObject({ entity: 'Diagnosis', field: 'stage_value' });
    }
  });

  it('distingue HER2 IHQ de ISH por Exam.exam_type y valida con código 0 [US-001 AC-7]', () => {
    const ihq = itemDe('mama', 'her2_ihq')?.destination;
    const ish = itemDe('mama', 'her2_ish')?.destination;

    expect([ihq?.entity, ish?.entity]).toEqual(['Biomarker', 'Biomarker']);
    expect(ihq?.match?.name).toBeDefined();
    expect(ihq?.match?.name).toBe(ish?.match?.name);
    expect(ihq?.match?.['exam.exam_type']).toBeDefined();
    expect(ihq?.match?.['exam.exam_type']).not.toBe(ish?.match?.['exam.exam_type']);
    expect(ejecutarValidador(CATALOGO).codigo).toBe(0);
  }, PLAZO_PROCESO_MS);

  it('declara en atributos.json las claves de ClinicalAttribute que usan los ítems [US-001 AC-7]', () => {
    const declaradas = (existsSync(path.join(CATALOGO, 'atributos.json')) ? leerJson('atributos.json').keys : []).map(
      (atributo) => atributo.key,
    );

    expect(declaradas.sort()).toEqual(['estado_castracion', 'estado_menopausico', 'sitios_metastasicos']);
  });
});
