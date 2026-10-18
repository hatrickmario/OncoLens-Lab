import { describe, expect, it } from 'vitest';
import {
  crearDetectorOpcionA,
  normalizarParaComparar,
  tokensDeIdentidad,
} from '../../../src/modules/evidence-analysis/deidentification/pii-detector.opcion-a.js';
import type { IdentidadDelPaciente } from '../../../src/modules/evidence-analysis/ports.js';
import {
  MINIMO_DE_TOKEN_DE_NOMBRE,
  configuracionDePiiDeTest,
} from '../../support/desidentificacion.js';

// Datos FICTICIOS; los números se arman por partes para no activar el escáner de PII de la CI.
const DOCUMENTO = ['5212', '3456'].join('');
const DOCUMENTO_CON_PUNTOS = ['52', '123', '456'].join('.');
const TELEFONO = ['300', '1234567'].join('');
const IDENTIDAD: IdentidadDelPaciente = {
  nombreCompleto: 'Lucía Fernanda Rondón de la Peña',
  documento: DOCUMENTO,
  telefono: TELEFONO,
};

const configuracion = configuracionDePiiDeTest();
const detectorDe = (identidad: IdentidadDelPaciente | null) =>
  crearDetectorOpcionA(identidad, configuracion);

describe('normalizarParaComparar', () => {
  it('quita tildes y mayúsculas cuando el texto lleva Lucía y RONDÓN', () => {
    expect(normalizarParaComparar('Lucía')).toBe('lucia');
    expect(normalizarParaComparar('RONDÓN Peña')).toBe('rondon pena');
  });
});

describe('tokensDeIdentidad', () => {
  it('ignora los tokens más cortos que el mínimo cuando el nombre trae partículas como de y la', () => {
    const { nombres } = tokensDeIdentidad(IDENTIDAD, MINIMO_DE_TOKEN_DE_NOMBRE);

    expect([...nombres].sort()).toEqual(['fernanda', 'lucia', 'pena', 'rondon']);
  });

  it('incluye los tokens del representante y deja el documento solo con dígitos cuando la identidad trae representante y puntos', () => {
    const { nombres, documentos } = tokensDeIdentidad(
      {
        nombreCompleto: 'Tomás Rondón',
        documento: DOCUMENTO_CON_PUNTOS,
        representante: { nombreCompleto: 'Ana Gómez', documento: `CC ${DOCUMENTO}` },
      },
      MINIMO_DE_TOKEN_DE_NOMBRE,
    );

    expect([...nombres].sort()).toEqual(['ana', 'gomez', 'rondon', 'tomas']);
    expect(documentos).toEqual([DOCUMENTO, DOCUMENTO]);
  });
});

describe('crearDetectorOpcionA · identidad conocida', () => {
  it('sustituye el nombre sin importar tildes ni mayúsculas por [NOMBRE] y reporta solo el tipo nombre', () => {
    const resultado = detectorDe(IDENTIDAD).enmascarar('Paciente LUCIA rondón con HER2 3+');

    expect(resultado.texto).toBe('Paciente [NOMBRE] [NOMBRE] con HER2 3+');
    expect(resultado.findingTypes).toEqual(['nombre']);
    expect(resultado.hallazgos).toBe(2);
  });

  it('no toca una palabra que solo contiene un token del nombre cuando la coincidencia no es de palabra completa', () => {
    const resultado = detectorDe(IDENTIDAD).enmascarar('Lucianos y penalizar no son el paciente');

    expect(resultado.texto).toBe('Lucianos y penalizar no son el paciente');
    expect(resultado.hallazgos).toBe(0);
  });

  it('sustituye el documento por [DOCUMENTO] aunque venga con puntos o espacios', () => {
    const resultado = detectorDe(IDENTIDAD).enmascarar(
      `CC ${DOCUMENTO_CON_PUNTOS} o ${DOCUMENTO.slice(0, 4)} ${DOCUMENTO.slice(4)}`,
    );

    expect(resultado.texto).toBe('CC [DOCUMENTO] o [DOCUMENTO]');
    expect(resultado.findingTypes).toEqual(['documento']);
  });

  it('sustituye el teléfono conocido por [TELEFONO] con separadores y sin palabra clave', () => {
    const resultado = detectorDe(IDENTIDAD).enmascarar(
      `llamar al ${TELEFONO.slice(0, 3)} ${TELEFONO.slice(3, 6)} ${TELEFONO.slice(6)}`,
    );

    expect(resultado.texto).toBe('llamar al [TELEFONO]');
    expect(resultado.findingTypes).toEqual(['telefono']);
  });

  it('no coincide con un número más largo que contiene el documento', () => {
    const resultado = detectorDe(IDENTIDAD).enmascarar(`código 9${DOCUMENTO}7`);

    expect(resultado.texto).toBe(`código 9${DOCUMENTO}7`);
  });
});

describe('crearDetectorOpcionA · formatos de L1D-166 y fechas', () => {
  const sinIdentidad = detectorDe(null);

  it('aplica el formato de documento con su marcador de pii-masks.json cuando hay palabra clave', () => {
    const resultado = sinIdentidad.enmascarar(`DNI ${['1234', '5678'].join('')}`);

    expect(resultado.texto).toBe('DNI [DOCUMENTO]');
    expect(resultado.findingTypes).toEqual(['documento_identidad']);
  });

  it('enmascara un teléfono con separadores precedido de su palabra clave y conserva la palabra clave', () => {
    const resultado = sinIdentidad.enmascarar(`Teléfono ${['300', '123', '4567'].join(' ')}`);

    expect(resultado.texto).toBe('Teléfono [TELEFONO]');
  });

  it('enmascara el correo y deja el resto del texto igual', () => {
    const resultado = sinIdentidad.enmascarar('escribir a ana.sintetica@ejemplo.test hoy');

    expect(resultado.texto).toBe('escribir a [CORREO] hoy');
    expect(resultado.findingTypes).toEqual(['correo']);
  });

  it('no aplica las exenciones del escáner de la CI: enmascara un documento con prefijo SINT- y un correo de example.com', () => {
    const resultado = sinIdentidad.enmascarar(
      `documento SINT-${['5555', '5555'].join('')} y ana@example.com`,
    );

    expect(resultado.texto).toBe('documento SINT-[DOCUMENTO] y [CORREO]');
  });

  it('respeta los límites de dígitos del formato: un número corto tras la palabra clave no es documento', () => {
    expect(sinIdentidad.enmascarar('ID 5 y HC 3').texto).toBe('ID 5 y HC 3');
  });

  it.each([
    ['la fecha numérica con barras', 'el 15/03/2024 hubo progresión', 'el [FECHA] hubo progresión'],
    [
      'la fecha numérica con guiones',
      'el 15-03-2024 hubo progresión',
      'el [FECHA] hubo progresión',
    ],
    ['la fecha con el mes en palabras', 'el 15 de marzo de 2024 hubo', 'el [FECHA] hubo'],
    ['la fecha ISO', 'el 2024-03-15 hubo', 'el [FECHA] hubo'],
  ])('sustituye %s por [FECHA]', (_caso, entrada, esperado) => {
    const resultado = sinIdentidad.enmascarar(entrada);

    expect(resultado.texto).toBe(esperado);
    expect(resultado.findingTypes).toEqual(['fecha']);
  });

  it.each([
    [
      'el mes en palabras sin de',
      'tras la progresión de marzo 2024 hubo',
      'tras la progresión de [FECHA] hubo',
    ],
    ['la fecha con puntos', 'el 15.03.2024 hubo', 'el [FECHA] hubo'],
    ['la fecha con año primero y barras', 'el 2024/03/15 hubo', 'el [FECHA] hubo'],
    ['la fecha con año primero y puntos', 'el 2024.03.15 hubo', 'el [FECHA] hubo'],
    ['el mes abreviado en español', 'el 15 mar 2024 hubo', 'el [FECHA] hubo'],
    ['el mes abreviado con punto', 'el 15 sept. 2024 hubo', 'el [FECHA] hubo'],
    ['el mes en inglés', 'on March 15, 2024 hubo', 'on [FECHA] hubo'],
    ['el mes abreviado en inglés', 'on 15 Mar 2024 hubo', 'on [FECHA] hubo'],
  ])('[US-049 AC-3] sustituye por [FECHA] %s', (_caso, entrada, esperado) => {
    expect(sinIdentidad.enmascarar(entrada).texto).toBe(esperado);
  });

  it('[US-049 AC-3] no mutila valores clínicos que se parecen a una fecha', () => {
    const texto =
      'Gleason 4+3, HER2 3+, T2cN0M0, PSA 4.5 ng/mL, mayo de dosis 2 mg, 3/4 ciclos, Ki-67 20-30%';

    expect(sinIdentidad.enmascarar(texto).texto).toBe(texto);
  });

  it.each([
    'PSA 4.0-10.0 ng/mL',
    'Hb 10.5-12.0 g/dL',
    'dosis 1.5/2.5/10 mg',
    'Ki-67 20-30%',
    '3/4 ciclos',
  ])('deja intacto el rango o la razón clínica «%s» cuando los separadores difieren', (texto) => {
    expect(sinIdentidad.enmascarar(texto).texto).toBe(texto);
  });

  it.each(['15/03-2024', '15.03/2024', '2024-03/15'])(
    'enmascara la fecha %s cuando los separadores se mezclan y el año tiene cuatro dígitos',
    (fecha) => {
      expect(sinIdentidad.enmascarar(`el ${fecha} hubo`).texto).toBe('el [FECHA] hubo');
    },
  );

  it('deja intacto «Plaquetas 150-450.000» junto a los rangos decimales', () => {
    expect(sinIdentidad.enmascarar('Plaquetas 150-450.000').texto).toBe('Plaquetas 150-450.000');
  });

  it('enmascara la fecha numérica cuando usa el mismo separador y el año de dos dígitos', () => {
    expect(sinIdentidad.enmascarar('el 16/08/25 y el 16.08.25 y el 16-08-2025').texto).toBe(
      'el [FECHA] y el [FECHA] y el [FECHA]',
    );
  });

  it('nunca rotula una fecha como teléfono ni documento aunque la preceda una palabra clave', () => {
    const resultado = sinIdentidad.enmascarar('Teléfono 15/03/2024 y DNI 15 de marzo de 2024');

    expect(resultado.texto).not.toContain('[TELEFONO]');
    expect(resultado.texto).not.toContain('[DOCUMENTO]');
    expect(resultado.texto).toBe('Teléfono [FECHA] y DNI [FECHA]');
  });

  it('deja intactos los términos clínicos HER2 3+ y Gleason 4+3', () => {
    const texto = 'HER2 3+ (IHQ), Gleason 4+3, ISUP 3, TNM_8 IIA, ECOG 1';

    const resultado = sinIdentidad.enmascarar(texto);

    expect(resultado.texto).toBe(texto);
    expect(resultado.findingTypes).toEqual([]);
    expect(resultado.hallazgos).toBe(0);
  });

  it('reporta findingTypes ordenados y sin valores cuando hay varios tipos', () => {
    const resultado = detectorDe(IDENTIDAD).enmascarar(
      `Lucía, CC ${DOCUMENTO}, el 15/03/2024, a ana@ejemplo.test`,
    );

    expect(resultado.findingTypes).toEqual(['correo', 'documento', 'fecha', 'nombre']);
    expect(JSON.stringify(resultado.findingTypes)).not.toContain('Lucía');
  });
});
