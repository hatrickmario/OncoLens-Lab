import { describe, expect, it } from 'vitest';
import { rutaDeHistorico } from '../../lib/caso/ruta-de-historico';

const ID = '8c3f5d7b-2e4a-4c6b-8d9f-1b2c3d4e5f60';

describe('rutaDeHistorico', () => {
  it.each([
    ['biomarker', `biomarkers/${ID}/history`],
    ['clinical_attribute', `clinical-attributes/${ID}/history`],
    ['prior_treatment', `prior-treatments/${ID}/history`],
    ['clinical_note', `clinical-notes/${ID}/history`],
  ])('devuelve el tramo bajo el paciente cuando el recurso es %s', (tipo, esperado) => {
    expect(rutaDeHistorico(tipo, ID)).toBe(esperado);
  });

  it.each(['diagnosis', 'clinical_event', 'recurso_nuevo', 'constructor', '__proto__'])(
    'devuelve null cuando el recurso %s no tiene histórico',
    (tipo) => {
      expect(rutaDeHistorico(tipo, ID)).toBeNull();
    },
  );

  it('codifica el id para que nunca cambie el tramo de la ruta', () => {
    expect(rutaDeHistorico('biomarker', '../x?y=1')).toBe('biomarkers/..%2Fx%3Fy%3D1/history');
  });
});
