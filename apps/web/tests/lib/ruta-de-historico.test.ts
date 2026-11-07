import { describe, expect, it } from 'vitest';
import type { ConversationDataLink } from '../../../../packages/api-contracts/src/types/clinical-api';
import { rutaDeHistorico } from '../../lib/caso/ruta-de-historico';

const ID = '8c3f5d7b-2e4a-4c6b-8d9f-1b2c3d4e5f60';
type Tipo = ConversationDataLink['resourceType'];

describe('rutaDeHistorico', () => {
  it.each<[Tipo, string | null]>([
    ['biomarker', `biomarkers/${ID}/history`],
    ['clinical_attribute', `clinical-attributes/${ID}/history`],
    ['prior_treatment', `prior-treatments/${ID}/history`],
    ['diagnosis', null],
    ['clinical_event', null],
  ])('devuelve %s -> %s para cada resourceType del contrato', (tipo, esperado) => {
    expect(rutaDeHistorico(tipo, ID)).toBe(esperado);
  });

  it('devuelve null cuando el resourceType no es del contrato ni una propiedad heredada', () => {
    for (const tipo of ['recurso_nuevo', 'constructor', '__proto__']) {
      expect(rutaDeHistorico(tipo as Tipo, ID)).toBeNull();
    }
  });

  it('codifica el id para que nunca cambie el tramo de la ruta', () => {
    expect(rutaDeHistorico('biomarker', '../x?y=1')).toBe('biomarkers/..%2Fx%3Fy%3D1/history');
  });
});
