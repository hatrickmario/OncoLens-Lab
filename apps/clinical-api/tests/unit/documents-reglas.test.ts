import { describe, expect, it } from 'vitest';
import { claveDeObjeto, esPdfPorMagicBytes } from '../../src/modules/documents/documents.reglas.js';

const PACIENTE = '00000000-0000-4000-8000-0000000000a1';
const DOCUMENTO = '3f1b8c52-7a4e-4d0b-9c1e-2a6f5d8e7b10';

describe('claveDeObjeto', () => {
  it('compone paciente y documento separados por una barra cuando recibe ambos UUID', () => {
    expect(claveDeObjeto(PACIENTE, DOCUMENTO)).toBe(`${PACIENTE}/${DOCUMENTO}`);
  });

  it('no incluye extensión ni nombre de archivo ni checksum, solo los dos UUID [RN-10]', () => {
    const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

    expect(claveDeObjeto(PACIENTE, DOCUMENTO)).toMatch(new RegExp(`^${uuid}/${uuid}$`));
  });
});

describe('esPdfPorMagicBytes', () => {
  it('es falso cuando no hay bytes', () => {
    expect(esPdfPorMagicBytes(Buffer.alloc(0))).toBe(false);
  });

  it('es verdadero cuando el contenido empieza exactamente por %PDF-', () => {
    expect(esPdfPorMagicBytes(Buffer.from('%PDF-'))).toBe(true);
  });

  it('es falso cuando solo está el prefijo parcial %PDF sin el guion', () => {
    expect(esPdfPorMagicBytes(Buffer.from('%PDF'))).toBe(false);
  });

  it('es falso cuando hay bytes antes de la firma', () => {
    expect(esPdfPorMagicBytes(Buffer.from(' %PDF-1.4'))).toBe(false);
  });

  it('es falso cuando el contenido es un contenedor ZIP (docx) aunque se llame .pdf', () => {
    expect(esPdfPorMagicBytes(Buffer.from('PK\x03\x04SINT', 'latin1'))).toBe(false);
  });
});
