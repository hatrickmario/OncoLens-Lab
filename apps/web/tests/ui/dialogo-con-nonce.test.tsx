// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { META_NONCE } from '../../lib/csp-nonce';
import { Dialog } from '../../components/ui/dialog';
import { NonceDeEstilos } from '../../components/atoms/nonce-de-estilos';

const NONCE = 'bm9uY2UtY29uZ2VsYWRv';

describe('Dialog bajo la CSP con nonce', () => {
  afterEach(() => {
    cleanup();
    document.head.innerHTML = '';
  });

  it('crea el style del bloqueo de scroll con el nonce de la request cuando se abre [US-216 AC-1]', () => {
    document.head.innerHTML = `<meta name="${META_NONCE}" content="${NONCE}">`;
    const retornoDeFoco = { current: null };

    render(
      <>
        <NonceDeEstilos />
        <Dialog
          abierto
          alCambiar={() => {}}
          titulo="T"
          descripcion="D"
          retornoDeFoco={retornoDeFoco}
        >
          <p>contenido</p>
        </Dialog>
      </>,
    );

    const estilos = [...document.querySelectorAll('style')];
    expect(estilos.length).toBeGreaterThan(0);
    for (const estilo of estilos) expect(estilo.getAttribute('nonce')).toBe(NONCE);
  });
});
