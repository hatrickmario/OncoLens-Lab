import type { ReactNode } from 'react';

/** Aviso que informa sin bloquear (RN-26). */
export function NonBlockingNotice(_props: { children: ReactNode }): never {
  throw new Error('no implementado');
}
