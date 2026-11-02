import { describe, expect, it } from 'vitest';
import { avisosDeOrden, evaluarTestRemoval } from '../verificar-commits-tdd.mjs';

describe('evaluarTestRemoval', () => {
  it('no exige nada cuando el mensaje no declara Test-Removal', () => {
    expect(evaluarTestRemoval('feat(L1D-1): algo\n\nCo-Authored-By: A <a@example.com>\n')).toEqual({
      declarado: false,
      visible: true,
    });
  });

  it('lo da por visible cuando git interpret-trailers lo devuelve', () => {
    const mensaje =
      'test(L1D-1): cambia\n\nTest-Removal: AC cambiado\nCo-Authored-By: A <a@example.com>\n';

    expect(evaluarTestRemoval(mensaje)).toEqual({ declarado: true, visible: true });
  });

  it('lo da por invisible cuando está en un párrafo anterior al último, como en 7 de los 12 del S4', () => {
    const mensaje =
      'test(L1D-1): cambia\n\nTest-Removal: AC cambiado en la spec.\n\nCo-Authored-By: A <a@example.com>\n';

    expect(evaluarTestRemoval(mensaje)).toEqual({ declarado: true, visible: false });
  });
});

describe('avisosDeOrden', () => {
  it('no avisa cuando el orden es contract → test → feat', () => {
    expect(avisosDeOrden(['contract(L1D-1): a', 'test(L1D-1): b', 'feat(L1D-1): c'])).toEqual([]);
  });

  it('avisa cuando un feat llega antes que su test', () => {
    const avisos = avisosDeOrden(['feat(L1D-1): c', 'test(L1D-1): b']);

    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('L1D-1');
  });

  it('avisa cuando el contract llega después del test, como en L1D-109', () => {
    expect(avisosDeOrden(['test(L1D-1): b', 'contract(L1D-1): a'])).toHaveLength(1);
  });

  it('separa las historias entre sí y acepta una historia sin contract', () => {
    expect(
      avisosDeOrden(['test(L1D-1): b', 'test(L1D-2): b', 'feat(L1D-1): c', 'feat(L1D-2): c']),
    ).toEqual([]);
  });

  it('ignora los commits que no son contract, test ni feat', () => {
    expect(avisosDeOrden(['docs(S4): x', 'refactor(L1D-1): y', 'chore: z'])).toEqual([]);
  });
});
