'use client';

import { leerConfiguracion } from '@/lib/server/config';

export function Panel() {
  return <span>{String(leerConfiguracion)}</span>;
}
