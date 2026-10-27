import type { ReactNode } from 'react';
import estilos from '../evidence.module.css';

/** Aviso que informa sin bloquear (RN-26): no oculta contenido ni deshabilita controles. */
export function NonBlockingNotice({ children }: { children: ReactNode }) {
  return (
    <div role="status" className={estilos.aviso}>
      {children}
    </div>
  );
}
