'use client';

import { useState } from 'react';

/**
 * Estado compartido por las filas corregibles de una tabla: la tabla (que no se remonta al recargar) recuerda qué dato se
 * reemplazó para mostrar el aviso de RN-26 y para que la fila nueva recoja el foco; la fila sí se remonta (otro `id`).
 */
export function useCorreccionEnTabla(alGuardar: () => void) {
  const [reemplazado, setReemplazado] = useState<string | null>(null);
  return {
    huboCorreccion: reemplazado !== null,
    /** Manejador de `alGuardar` del dato `id`: lo recuerda y recarga la vista. */
    alCorregir: (id: string) => () => {
      setReemplazado(id);
      alGuardar();
    },
    /** `true` si la fila es la que acaba de sustituir al dato corregido. */
    esReemplazo: (supersedesId: string | null | undefined) =>
      reemplazado !== null && supersedesId === reemplazado,
  };
}
