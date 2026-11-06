'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * Da el foco a `ref` una vez, al montarse, si `activo`. Tras una corrección la fila nueva sustituye a la anterior (otro
 * `id`, otro botón): sin esto el foco del teclado caería al `body` al cerrarse el diálogo.
 */
export function useFocoAlMontar(ref: RefObject<HTMLElement | null>, activo: boolean): void {
  const [enfocarAlMontar] = useState(activo); // la decisión es de la fila nueva, no de renders posteriores
  useEffect(() => {
    if (enfocarAlMontar) ref.current?.focus();
  }, [enfocarAlMontar, ref]);
}
