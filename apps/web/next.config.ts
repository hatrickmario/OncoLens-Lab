import path from 'node:path';
import type { NextConfig } from 'next';

// Turbopack es el bundler por defecto en dev y build: sin `webpack()` personalizado (si hiciera falta, ADR).
// Sin variables NEXT_PUBLIC_: web no expone configuración al navegador (design.md, Seguridad web).
const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // La build standalone traza desde la raíz del monorepo: web importa el SDK generado de packages/api-contracts.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // `refinamientos.gen.ts` (generado) importa './zod.gen.js'; Turbopack no lo resuelve a `.ts` por sí solo.
  turbopack: {
    resolveAlias: {
      './zod.gen.js': '../../packages/api-contracts/src/zod/clinical-api/zod.gen.ts',
    },
  },
};

export default nextConfig;
