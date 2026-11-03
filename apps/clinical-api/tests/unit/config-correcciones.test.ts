import { describe, expect, it } from 'vitest';
import { ConfiguracionInvalidaError, readCorreccionesConfig } from '../../src/config/index.js';

describe('readCorreccionesConfig', () => {
  it('aplica los límites por defecto cuando CLINICAL_NOTE_MAX_CHARS y CORRECTION_HISTORY_MAX no están', () => {
    expect(readCorreccionesConfig({})).toEqual({
      clinicalNoteMaxChars: 2000,
      correctionHistoryMax: 50,
    });
  });

  it('lee ambos límites del entorno', () => {
    expect(
      readCorreccionesConfig({ CLINICAL_NOTE_MAX_CHARS: '500', CORRECTION_HISTORY_MAX: '5' }),
    ).toEqual({ clinicalNoteMaxChars: 500, correctionHistoryMax: 5 });
  });

  it.each(['CLINICAL_NOTE_MAX_CHARS', 'CORRECTION_HISTORY_MAX'])(
    'rechaza nombrando la variable cuando %s no es un entero positivo',
    (variable) => {
      expect(() => readCorreccionesConfig({ [variable]: '0' })).toThrow(ConfiguracionInvalidaError);
    },
  );
});
