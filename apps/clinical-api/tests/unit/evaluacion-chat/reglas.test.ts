import { describe, expect, it } from 'vitest';
import { idDeTratamiento, idSembrado } from '../../../prisma/seed/determinismo.js';
import {
  DOCUMENTO_SINTETICO_CHAT,
  NACIMIENTO_SINTETICO_CHAT,
  NOMBRE_SINTETICO_CHAT,
} from '../../../prisma/seed/pacientes/chat.js';
import { identidadSinteticaDe } from '../../../prisma/seed/identidades.js';
import { PACIENTES_SEMILLA } from '../../../prisma/seed/pacientes/indice.js';
import {
  HechoEsperadoNoEncontradoError,
  MarcadorDeIdentidadDesconocidoError,
  PacienteDelSeedDesconocidoError,
  identidadSinteticaDelPaciente,
  idsDePacientesDelSeed,
  recursoDelSeed,
  resolverMarcadorDeIdentidad,
  traducirHechosEsperados,
} from '../../../src/evaluacion/chat/reglas.js';

describe('resolverMarcadorDeIdentidad', () => {
  it('sustituye el marcador de P-CHAT por su nombre, documento y fecha de nacimiento sintéticos cuando la pregunta lo trae', () => {
    const resuelta = resolverMarcadorDeIdentidad(
      'La paciente {identidad_sintetica:P-CHAT}, ¿cuál es su situación actual?',
    );

    expect(resuelta).toBe(
      `La paciente ${NOMBRE_SINTETICO_CHAT}, ${DOCUMENTO_SINTETICO_CHAT}, nacida el ${NACIMIENTO_SINTETICO_CHAT}, ¿cuál es su situación actual?`,
    );
  });

  it('devuelve la pregunta igual cuando no trae marcador', () => {
    expect(resolverMarcadorDeIdentidad('¿Qué resultado tuvo el HER2?')).toBe(
      '¿Qué resultado tuvo el HER2?',
    );
  });

  it('lanza cuando el marcador nombra a un paciente que el seed no conoce', () => {
    expect(() => resolverMarcadorDeIdentidad('{identidad_sintetica:P-OTRO}')).toThrow(
      MarcadorDeIdentidadDesconocidoError,
    );
  });
});

describe('recursoDelSeed', () => {
  it.each([
    ['paciente-a/diagnostico-1', idSembrado('paciente-a/diagnostico-1')],
    ['paciente-a/her2', idSembrado('paciente-a/examen-ihq/her2')],
    ['paciente-b/psa-2', idSembrado('paciente-b/psa-2/psa')],
    ['paciente-a/estado-menopausico', idSembrado('paciente-a/estado-menopausico')],
    ['paciente-chat/diagnostico-iia', idSembrado('paciente-chat/diagnostico-iia')],
  ])('devuelve el id sembrado de %s', (clave, esperado) => {
    expect(recursoDelSeed(clave)).toBe(esperado);
  });

  it('devuelve el id del tratamiento y del evento de un paciente de próstata', () => {
    const b = PACIENTES_SEMILLA.find((paciente) => paciente.clave === 'paciente-b');
    const tratamiento = b?.tratamientosPrevios[0]?.clave ?? '';
    const evento = b?.eventos[0]?.clave ?? '';

    expect(recursoDelSeed(`paciente-b/${tratamiento}`)).toBe(
      idDeTratamiento('paciente-b', tratamiento),
    );
    expect(recursoDelSeed(`paciente-b/${evento}`)).toBe(idSembrado(`paciente-b/${evento}`));
  });

  it.each(['paciente-a/no-existe', 'paciente-zzz/her2', 'paciente-a', 'paciente-a/her2/mas'])(
    'devuelve null cuando %s no es un dato del seed',
    (clave) => {
      expect(recursoDelSeed(clave)).toBeNull();
    },
  );
});

describe('traducirHechosEsperados', () => {
  const recurso = (clave: string): string | null =>
    ({ 'p/a': 'id-a', 'p/b': 'id-b' })[clave] ?? null;
  const enlaces = [
    { factRef: 'f1', resourceId: 'id-a' },
    { factRef: 'f2', resourceId: 'id-b' },
  ];

  it('traduce cada clave al factRef del enlace de su recurso y no escribe ningún identificador', () => {
    const traducidos = traducirHechosEsperados(['p/b', 'p/a'], enlaces, recurso);

    expect(traducidos).toEqual({ 'p/b': 'f2', 'p/a': 'f1' });
    expect(JSON.stringify(traducidos)).not.toContain('id-');
  });

  it('devuelve vacío cuando el caso no espera hechos', () => {
    expect(traducirHechosEsperados([], enlaces, recurso)).toEqual({});
  });

  it('lanza nombrando la clave cuando el seed no tiene el recurso', () => {
    expect(() => traducirHechosEsperados(['p/zzz'], enlaces, recurso)).toThrow(
      new HechoEsperadoNoEncontradoError('p/zzz'),
    );
  });

  it('lanza nombrando la clave cuando el recurso existe pero la petición no lo lleva como hecho', () => {
    expect(() => traducirHechosEsperados(['p/b'], [enlaces[0]!], recurso)).toThrow(
      HechoEsperadoNoEncontradoError,
    );
  });
});

describe('identidadSinteticaDelPaciente', () => {
  it('devuelve el nombre, el documento y la fecha de nacimiento sintéticos de P-CHAT', () => {
    expect(identidadSinteticaDelPaciente('paciente-chat')).toEqual([
      NOMBRE_SINTETICO_CHAT,
      DOCUMENTO_SINTETICO_CHAT,
      NACIMIENTO_SINTETICO_CHAT,
    ]);
  });

  it('devuelve el nombre y el documento sintéticos del ordinal del paciente semilla', () => {
    const segundo = identidadSinteticaDe(idSembrado('paciente-b'), 2);

    expect(identidadSinteticaDelPaciente('paciente-b')).toEqual([
      segundo.nombreCompleto,
      segundo.numeroDeDocumento,
    ]);
  });

  it('lanza cuando el paciente no es del seed', () => {
    expect(() => identidadSinteticaDelPaciente('paciente-zzz')).toThrow(
      PacienteDelSeedDesconocidoError,
    );
  });
});

describe('idsDePacientesDelSeed', () => {
  it('incluye los pacientes semilla y P-CHAT', () => {
    const ids = idsDePacientesDelSeed();

    expect(ids.size).toBe(PACIENTES_SEMILLA.length + 1);
    expect(ids.has(idSembrado('paciente-chat'))).toBe(true);
  });
});
