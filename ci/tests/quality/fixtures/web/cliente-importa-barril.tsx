'use client';

import { leerConfiguracion } from '@/lib/server';

export function Panel() {
  return <span>{String(leerConfiguracion)}</span>;
}
