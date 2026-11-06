import path from 'node:path';
import type { NextConfig } from 'next';

// Turbopack es el bundler por defecto en dev y build: sin `webpack()` personalizado (si hiciera falta, ADR).
// Sin variables NEXT_PUBLIC_: web no expone configuración al navegador (design.md, Seguridad web).
// Cabeceras sin estado (US-216, design D1): cubren también los estáticos, que no pasan por `proxy.ts`.
const CABECERAS_DE_ENDURECIMIENTO = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  headers: async () => [{ source: '/:path*', headers: CABECERAS_DE_ENDURECIMIENTO }],
  // La build standalone traza desde la raíz del monorepo: web importa el SDK generado de packages/api-contracts.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // TODO(D4-22, excepción temporal): el verificador RN-23 (packages/clinical-language/src) importa a sus
  // hermanos con `.js` (NodeNext) y Turbopack no lo reescribe a `.ts`, así que se declara cada uno aquí.
  // Alternativa que retira este alias: un subpath puro `./verificador` en packages/clinical-language, sin
  // `node:fs` y con imports sin extensión. Un test (alias-verificador-rn23) exige un alias por importación.
  turbopack: {
    resolveAlias: {
      './normalizar.js': '../../packages/clinical-language/src/normalizar.ts',
      './secuencias.js': '../../packages/clinical-language/src/secuencias.ts',
      './tipos.js': '../../packages/clinical-language/src/tipos.ts',
    },
  },
};

export default nextConfig;
