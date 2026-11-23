import { describe, expect, it } from 'vitest';
import {
  DatasetDeChatInvalidoError,
  cargarCasosDelChat,
} from '../../../src/evaluacion/chat/dataset.js';

const leerYaml = (yaml: string) => () => yaml;

describe('cargarCasosDelChat', () => {
  it('lee los 13 casos y los 2 controles del dataset chat-v1 del repositorio', () => {
    const casos = cargarCasosDelChat(new URL('../../../../..', import.meta.url).pathname);

    expect(casos).toHaveLength(15);
    expect(casos.find((caso) => caso.id === 'CHAT-AC01-MAMA-PII')).toMatchObject({
      paciente: 'paciente-chat',
      hechosEsperados: ['paciente-chat/diagnostico-iia'],
    });
  });

  it('asigna a cada control el paciente del primer caso de su tipo de cáncer y ningún hecho esperado', () => {
    const casos = cargarCasosDelChat(
      '/raiz',
      leerYaml(`
casos:
  - {id: C1, cancer: mama, paciente: paciente-a, pregunta: 'p1', hechos_esperados: [paciente-a/her2]}
  - {id: C2, cancer: prostata, paciente: paciente-b, pregunta: 'p2'}
controles:
  - {id: K1, cancer: prostata, pregunta: 'pk'}
`),
    );

    expect(casos.find((caso) => caso.id === 'K1')).toEqual({
      id: 'K1',
      cancer: 'prostata',
      paciente: 'paciente-b',
      pregunta: 'pk',
      hechosEsperados: [],
    });
  });

  it('lanza nombrando el caso y el campo cuando a un caso le falta la pregunta', () => {
    expect(() =>
      cargarCasosDelChat(
        '/raiz',
        leerYaml('casos:\n  - {id: C1, cancer: mama, paciente: paciente-a}\ncontroles: []'),
      ),
    ).toThrow(new DatasetDeChatInvalidoError('C1: falta pregunta'));
  });

  it('lanza cuando un control no tiene ningún caso de su tipo de cáncer', () => {
    expect(() =>
      cargarCasosDelChat(
        '/raiz',
        leerYaml("casos: []\ncontroles:\n  - {id: K1, cancer: mama, pregunta: 'p'}"),
      ),
    ).toThrow(DatasetDeChatInvalidoError);
  });
});
