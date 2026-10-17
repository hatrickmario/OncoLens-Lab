import { describe, expect, it } from 'vitest';
import { leerConfigWeb } from '../../lib/server/config';

const completo = {
  CLINICAL_API_URL: 'http://clinical-api:3000',
  WEB_ALLOWED_ORIGIN: 'http://127.0.0.1:3000',
  WEB_UPSTREAM_TIMEOUT_MS: '40000',
  WEB_HOME_PATH: '/pacientes/00000000-0000-4000-8000-000000000001/analisis',
};

describe('leerConfigWeb', () => {
  it('lee la URL interna, el origen permitido y el timeout del entorno', () => {
    expect(leerConfigWeb(completo)).toEqual({
      clinicalApiUrl: 'http://clinical-api:3000',
      allowedOrigin: 'http://127.0.0.1:3000',
      upstreamTimeoutMs: 40000,
      maxBodyBytes: 32768,
      homePath: '/pacientes/00000000-0000-4000-8000-000000000001/analisis',
    });
  });

  it('lee WEB_MAX_BODY_BYTES del entorno cuando se define', () => {
    expect(leerConfigWeb({ ...completo, WEB_MAX_BODY_BYTES: '1024' }).maxBodyBytes).toBe(1024);
  });

  it('falla cuando WEB_MAX_BODY_BYTES no es un entero positivo', () => {
    expect(() => leerConfigWeb({ ...completo, WEB_MAX_BODY_BYTES: '0' })).toThrow(
      'WEB_MAX_BODY_BYTES',
    );
  });

  it.each(['CLINICAL_API_URL', 'WEB_ALLOWED_ORIGIN', 'WEB_UPSTREAM_TIMEOUT_MS', 'WEB_HOME_PATH'])(
    'falla nombrando la variable cuando falta %s',
    (nombre) => {
      expect(() => leerConfigWeb({ ...completo, [nombre]: undefined })).toThrow(nombre);
    },
  );

  it('falla cuando el timeout no es un entero positivo', () => {
    expect(() => leerConfigWeb({ ...completo, WEB_UPSTREAM_TIMEOUT_MS: 'abc' })).toThrow(
      'WEB_UPSTREAM_TIMEOUT_MS',
    );
  });

  it.each([
    ['//evil.example/x'],
    ['https://evil.example'],
    ['pacientes/x'],
    ['/\\evil.example'],
    ['/\t/evil.example'],
    ['/\n/evil.example'],
    ['/a\u0000b'],
  ])('falla nombrando WEB_HOME_PATH cuando no es una ruta interna (%j)', (valor) => {
    expect(() => leerConfigWeb({ ...completo, WEB_HOME_PATH: valor })).toThrow('WEB_HOME_PATH');
  });
});
