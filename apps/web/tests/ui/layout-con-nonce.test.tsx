import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RootLayout from '../../app/layout';
import { CABECERA_NONCE, META_NONCE } from '../../lib/csp-nonce';

const { cabeceras } = vi.hoisted(() => ({ cabeceras: new Headers() }));
vi.mock('next/headers', () => ({ headers: async () => cabeceras }));

const NONCE = 'bm9uY2UtY29uZ2VsYWRv';

async function html() {
  return renderToStaticMarkup(await RootLayout({ children: <p>x</p> }));
}

describe('RootLayout', () => {
  beforeEach(() => {
    cabeceras.delete(CABECERA_NONCE);
  });

  it('publica el nonce de la request en el meta cuando el proxy lo pasó [US-216 AC-1]', async () => {
    cabeceras.set(CABECERA_NONCE, NONCE);

    expect(await html()).toContain(`<meta name="${META_NONCE}" content="${NONCE}"/>`);
  });

  it('no emite el meta cuando la request no trae nonce [US-216 AC-1]', async () => {
    expect(await html()).not.toContain(META_NONCE);
  });
});
