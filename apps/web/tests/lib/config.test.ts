import { describe, expect, it } from 'vitest';
import { leerConfigWeb } from '../../lib/server/config';

const completo = {
  CLINICAL_API_URL: 'http://clinical-api:3000',
  WEB_ALLOWED_ORIGIN: 'http://127.0.0.1:3000',
  WEB_UPSTREAM_TIMEOUT_MS: '40000',
};

describe('leerConfigWeb', () => {
  it('lee la URL interna, el origen permitido y el timeout del entorno', () => {
    expect(leerConfigWeb(completo)).toEqual({
      clinicalApiUrl: 'http://clinical-api:3000',
      allowedOrigin: 'http://127.0.0.1:3000',
      upstreamTimeoutMs: 40000,
    });
  });

  it.each(['CLINICAL_API_URL', 'WEB_ALLOWED_ORIGIN', 'WEB_UPSTREAM_TIMEOUT_MS'])(
    'falla nombrando la variable cuando falta %s',
    (nombre) => {
      expect(() => leerConfigWeb({ ...completo, [nombre]: undefined })).toThrow(nombre);
    },
  );

  it('falla cuando el timeout no es un entero positivo', () => {
    expect(() => leerConfigWeb({ ...completo, WEB_UPSTREAM_TIMEOUT_MS: 'abc' })).toThrow('WEB_UPSTREAM_TIMEOUT_MS');
  });
});
