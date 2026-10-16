'use client';

import { leerConfiguracion } from './server';

export function Panel() {
  return <span>{String(leerConfiguracion)}</span>;
}
