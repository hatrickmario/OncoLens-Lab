import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { NonceDeEstilos } from '../components/atoms/nonce-de-estilos';
import { CABECERA_NONCE, META_NONCE } from '../lib/csp-nonce';
import './globals.css';

/**
 * Render dinámico en toda la app: el nonce de la CSP cambia en cada request (`proxy.ts`) y Next solo puede
 * aplicarlo a sus scripts si la página se genera por request (US-216, design D3). Sin nonce no se emite el meta.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get(CABECERA_NONCE);
  return (
    <html lang="es">
      {nonce ? (
        <head>
          <meta name={META_NONCE} content={nonce} />
        </head>
      ) : null}
      <body>
        <NonceDeEstilos />
        {children}
      </body>
    </html>
  );
}
