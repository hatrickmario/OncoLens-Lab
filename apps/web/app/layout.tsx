import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { NonceDeEstilos } from '../components/atoms/nonce-de-estilos';
import './globals.css';

/**
 * Render dinámico en toda la app: el nonce de la CSP cambia en cada request (`proxy.ts`) y Next solo puede
 * aplicarlo a sus scripts si la página se genera por request (US-216, design D3). El nonce también se publica
 * para los estilos que inyectan los diálogos de Radix.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? '';
  return (
    <html lang="es">
      <head>
        <meta name="csp-nonce" content={nonce} />
      </head>
      <body>
        <NonceDeEstilos />
        {children}
      </body>
    </html>
  );
}
