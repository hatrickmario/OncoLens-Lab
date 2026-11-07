import { describe, expect, it } from 'vitest';
import { exigirEntornoDeTest } from '../../../scripts/chat-preparar/guarda-de-entorno.js';

describe('exigirEntornoDeTest (RN-13)', () => {
  it('permite el entorno test sin datos reales habilitados', () => {
    expect(() => exigirEntornoDeTest({ APP_ENV: 'test' })).not.toThrow();
  });

  it.each(['REAL_ANONYMIZED_ENABLED', 'REAL_IDENTIFIED_ENABLED'])(
    'se niega nombrando %s cuando está en true',
    (variable) => {
      expect(() => exigirEntornoDeTest({ APP_ENV: 'test', [variable]: 'true' })).toThrow(variable);
    },
  );

  it('se niega en el entorno piloto sin distinguir mayúsculas', () => {
    expect(() => exigirEntornoDeTest({ APP_ENV: 'Piloto' })).toThrow('APP_ENV');
  });

  it('se niega cuando APP_ENV no está definida, porque no presume un entorno permitido', () => {
    expect(() => exigirEntornoDeTest({})).toThrow('APP_ENV');
  });
});
