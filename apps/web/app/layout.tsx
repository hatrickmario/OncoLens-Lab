import { connection } from 'next/server';
import type { ReactNode } from 'react';
import './globals.css';

/**
 * Render dinámico en toda la app: el nonce de la CSP cambia en cada request (`proxy.ts`) y Next solo puede
 * aplicarlo a sus scripts si la página se genera por request, no en la build (US-216, design D3).
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
