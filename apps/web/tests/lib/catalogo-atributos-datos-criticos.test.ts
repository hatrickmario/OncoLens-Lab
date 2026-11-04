import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CATALOGOS = path.resolve(__dirname, '../../../../packages/clinical-catalogs');

interface DatoCritico {
  key: string;
  destination: { entity: string; match?: { attribute_key?: string } };
}

const rutas = {
  mama: 'mama/datos-criticos.json',
  prostata: 'prostata/datos-criticos.json',
  'test-1.0.0 mama': 'test/fixtures/test-1.0.0/mama/datos-criticos.json',
  'test-1.0.0 prostata': 'test/fixtures/test-1.0.0/prostata/datos-criticos.json',
} as const;

const atributosDe = (ruta: string): DatoCritico[] =>
  (
    JSON.parse(readFileSync(path.join(CATALOGOS, ruta), 'utf8')) as { items: DatoCritico[] }
  ).items.filter((item) => item.destination.entity === 'ClinicalAttribute');

describe('datos críticos con destino ClinicalAttribute del catálogo', () => {
  it.each(Object.entries(rutas))(
    'tiene attribute_key igual a su key en %s (la columna abre el atributo por la clave del ítem) [US-004 AC-2]',
    (_nombre, ruta) => {
      for (const atributo of atributosDe(ruta)) {
        expect(atributo.destination.match?.attribute_key).toBe(atributo.key);
      }
    },
  );
});

describe('datos críticos de mama con destino ClinicalAttribute', () => {
  it('incluye estado_menopausico, el atributo que la columna abre preseleccionado [US-004 AC-2]', () => {
    expect(atributosDe(rutas.mama).map((a) => a.key)).toContain('estado_menopausico');
  });
});
