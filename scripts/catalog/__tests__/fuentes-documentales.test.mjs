import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CATALOGO,
  PLAZO_PROCESO_MS,
  copiarFixture,
  ejecutarValidador,
  limpiarCopias,
  modificarJson,
} from './apoyo.mjs';

afterEach(limpiarCopias);

const FIXTURE = 'fx-04-a/test-1.0.0';
const TIPOS_DE_DOCUMENTO = ['historia_clinica', 'examen'];
const leer = (...partes) => JSON.parse(readFileSync(path.join(CATALOGO, ...partes), 'utf8'));
const sobreKi67 = (catalogo, cambio) =>
  modificarJson(catalogo, 'mama/datos-criticos.json', (c) => {
    cambio(c.items.find((item) => item.key === 'ki67'));
  });

describe('catalog:validate · sourceDocumentTypes de datos-criticos.json (US-263, RN-29)', () => {
  it(
    'acepta el catálogo real 1.8.0 con sourceDocumentTypes no vacío en todos los ítems de mama y próstata [US-263 AC-1]',
    () => {
      const resultado = ejecutarValidador(CATALOGO);

      expect(resultado.codigo).toBe(0);
      expect(leer('manifest.json').version).toBe('1.8.0');
      for (const tipo of ['mama', 'prostata']) {
        for (const item of leer(tipo, 'datos-criticos.json').items) {
          expect(item.sourceDocumentTypes.length, `${tipo}/${item.key}`).toBeGreaterThan(0);
          expect(
            item.sourceDocumentTypes.every((t) => TIPOS_DE_DOCUMENTO.includes(t)),
            `${tipo}/${item.key}`,
          ).toBe(true);
        }
      }
    },
    PLAZO_PROCESO_MS,
  );

  it('declara el mapeo de tipos de documento como propuesta hasta DEC-01 [US-263 AC-1]', () => {
    for (const tipo of ['mama', 'prostata']) {
      for (const item of leer(tipo, 'datos-criticos.json').items) {
        expect(item.estado, `${tipo}/${item.key}`).toBe('propuesta');
      }
    }
  });

  it(
    'rechaza un ítem sin sourceDocumentTypes y nombra el ítem [US-263 AC-1]',
    () => {
      const catalogo = copiarFixture(FIXTURE);
      sobreKi67(catalogo, (item) => {
        delete item.sourceDocumentTypes;
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('fuente_documental_invalida mama/ki67');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza un valor fuera del enum document_type y nombra el ítem [US-263 AC-1]',
    () => {
      const catalogo = copiarFixture(FIXTURE);
      sobreKi67(catalogo, (item) => {
        item.sourceDocumentTypes = ['patologia'];
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('ki67');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza un sourceDocumentTypes vacío y nombra el ítem [US-263 AC-1]',
    () => {
      const catalogo = copiarFixture(FIXTURE);
      sobreKi67(catalogo, (item) => {
        item.sourceDocumentTypes = [];
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('ki67');
    },
    PLAZO_PROCESO_MS,
  );
});
