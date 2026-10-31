import path from 'node:path';
import type { NextConfig } from 'next';

// Turbopack es el bundler por defecto en dev y build: sin `webpack()` personalizado (si hiciera falta, ADR).
// Sin variables NEXT_PUBLIC_: web no expone configuración al navegador (design.md, Seguridad web).
const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // La build standalone traza desde la raíz del monorepo: web importa el SDK generado de packages/api-contracts.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // El verificador RN-23 (packages/clinical-language/src) importa sus hermanos con `.js` (NodeNext) y Turbopack
  // no lo reescribe a `.ts`: se declara cada uno, solo para que el panel filtre texto generado (US-246).
  turbopack: {
    resolveAlias: {
      './normalizar.js': '../../packages/clinical-language/src/normalizar.ts',
      './secuencias.js': '../../packages/clinical-language/src/secuencias.ts',
    },
  },
};

export default nextConfig;
