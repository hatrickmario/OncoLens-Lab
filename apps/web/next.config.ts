import type { NextConfig } from 'next';

// Turbopack es el bundler por defecto en dev y build: sin `webpack()` personalizado (si hiciera falta, ADR).
// Sin variables NEXT_PUBLIC_: web no expone configuración al navegador (design.md, Seguridad web).
const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
};

export default nextConfig;
