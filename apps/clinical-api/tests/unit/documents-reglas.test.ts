import { describe, expect, it } from 'vitest';
import {
  bytesMaximosDeCarga,
  claveDeObjeto,
  contenidoExcedeElLimiteDeCarga,
  MARGEN_DEL_MULTIPART_BYTES,
  esPdfPorMagicBytes,
  limiteDeLecturaDeCarga,
  normalizarNombreOriginal,
  superaTamanoMaximo,
} from '../../src/modules/documents/documents.reglas.js';

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

describe('superaTamanoMaximo', () => {
  const UN_MIB = 1024 * 1024;

  it('es falso cuando el archivo mide justo el máximo configurado', () => {
    expect(superaTamanoMaximo(20 * UN_MIB, 20)).toBe(false);
  });

  it('es verdadero cuando el archivo mide un byte más que el máximo configurado', () => {
    expect(superaTamanoMaximo(20 * UN_MIB + 1, 20)).toBe(true);
  });

  it('es falso cuando el archivo está vacío', () => {
    expect(superaTamanoMaximo(0, 20)).toBe(false);
  });

  it('respeta un máximo distinto cuando la configuración cambia', () => {
    expect(superaTamanoMaximo(2 * UN_MIB + 1, 2)).toBe(true);
    expect(superaTamanoMaximo(2 * UN_MIB, 2)).toBe(false);
  });
});

describe('bytesMaximosDeCarga', () => {
  it('convierte los MiB configurados a bytes', () => {
    expect(bytesMaximosDeCarga(20)).toBe(20_971_520);
  });
});

describe('contenidoExcedeElLimiteDeCarga', () => {
  const UN_MIB = 1024 * 1024;

  it('es falso cuando no hay Content-Length', () => {
    expect(contenidoExcedeElLimiteDeCarga(undefined, 1)).toBe(false);
  });

  it('es falso cuando el cuerpo mide el máximo más el margen del multipart', () => {
    expect(contenidoExcedeElLimiteDeCarga(UN_MIB + MARGEN_DEL_MULTIPART_BYTES, 1)).toBe(false);
  });

  it('es verdadero cuando el cuerpo supera el máximo más el margen en un byte', () => {
    expect(contenidoExcedeElLimiteDeCarga(UN_MIB + MARGEN_DEL_MULTIPART_BYTES + 1, 1)).toBe(true);
  });
});

describe('limiteDeLecturaDeCarga', () => {
  it('es un byte más que el máximo porque el lector marca el límite al alcanzarlo, no al superarlo', () => {
    expect(limiteDeLecturaDeCarga(20)).toBe(bytesMaximosDeCarga(20) + 1);
  });
});

describe('normalizarNombreOriginal', () => {
  it('deja intacto un nombre corriente', () => {
    expect(normalizarNombreOriginal('mama-examen.pdf')).toBe('mama-examen.pdf');
  });

  it('quita NUL, saltos de línea y demás caracteres de control', () => {
    expect(normalizarNombreOriginal('inf\u0000orme\r\n\t.pdf')).toBe('informe.pdf');
  });

  it('quita los caracteres de formato invisibles (cero ancho y sobrescritura bidireccional)', () => {
    expect(normalizarNombreOriginal('a\u200Bb\u202Ec.pdf')).toBe('abc.pdf');
  });

  it('compone a NFC cuando la tilde llega como carácter combinante', () => {
    expect(normalizarNombreOriginal('exame\u0301n.pdf')).toBe('examén.pdf');
  });

  it('trunca a 255 caracteres sin partir un par sustituto', () => {
    const largo = `${'😀'.repeat(300)}.pdf`;

    expect(Array.from(normalizarNombreOriginal(largo))).toHaveLength(255);
  });

  it('usa sin-nombre.pdf cuando solo quedaba basura', () => {
    expect(normalizarNombreOriginal('\u0000\r\n')).toBe('sin-nombre.pdf');
  });
});
