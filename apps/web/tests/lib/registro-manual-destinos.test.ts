import { describe, expect, it } from 'vitest';
import { DESTINO_DE_REGISTRO, hrefDeAccionManual } from '../../lib/registro-manual/destinos';
import { hrefDeRegistroManual } from '../../lib/registro-manual/enlaces';

const ID = '0b5c9c1e-5f0e-4d6b-8c55-3f7a1a2b9d10';

describe('destino de registro por entidad', () => {
  it('lleva Ki-67 a /caso?item=ki67 y Grado a la ficha con ?item=grado [US-004 AC-3]', () => {
    expect(hrefDeAccionManual(ID, { tipo: 'biomarcador', item: 'ki67' })).toBe(
      `/pacientes/${ID}/caso?item=ki67`,
    );
    expect(hrefDeAccionManual(ID, { tipo: 'diagnostico', item: 'grado' })).toBe(
      `/pacientes/${ID}?item=grado`,
    );
  });

  it.each(Object.entries(DESTINO_DE_REGISTRO))(
    'arma el enlace de %s con la página que declara el catálogo de destinos [US-004 AC-3]',
    (_entidad, { tipo, pagina }) => {
      expect(hrefDeAccionManual(ID, { tipo, item: 'clave' })).toBe(
        hrefDeRegistroManual(ID, 'clave', pagina),
      );
    },
  );

  it('declara las cuatro entidades del checklist con un tipo de acción distinto cada una', () => {
    expect(Object.keys(DESTINO_DE_REGISTRO).sort()).toEqual([
      'Biomarker',
      'ClinicalAttribute',
      'Diagnosis',
      'PriorTreatment',
    ]);
    expect(new Set(Object.values(DESTINO_DE_REGISTRO).map((d) => d.tipo)).size).toBe(4);
  });
});
