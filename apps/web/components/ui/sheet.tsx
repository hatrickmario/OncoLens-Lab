'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode, RefObject } from 'react';

export interface SheetProps {
  abierto: boolean;
  alCambiar: (abierto: boolean) => void;
  titulo: string;
  descripcion: string;
  /** Texto del botón que cierra el panel. */
  cerrar: string;
  children: ReactNode;
  /** Elemento que abrió el panel: recibe el foco al cerrarse (como en `Dialog`). */
  retornoDeFoco: RefObject<HTMLElement | null>;
}

/**
 * Panel lateral modal (variante de `Dialog`, S6 variante B): a la derecha, de ancho completo por debajo de 480 px; foco
 * atrapado, `Esc` cierra y el foco vuelve al disparador. No toca la URL ni desmonta lo que hay detrás.
 */
export function Sheet({
  abierto,
  alCambiar,
  titulo,
  descripcion,
  cerrar,
  children,
  retornoDeFoco,
}: SheetProps) {
  return (
    <RadixDialog.Root open={abierto} onOpenChange={alCambiar}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <RadixDialog.Content
          onCloseAutoFocus={(evento) => {
            evento.preventDefault();
            retornoDeFoco.current?.focus();
          }}
          className="bg-surface border-border fixed inset-y-0 right-0 z-50 flex w-full max-w-full flex-col overflow-y-auto border-l min-[480px]:w-[440px]"
        >
          <header className="bg-surface-alt border-border sticky top-0 flex items-center gap-2 border-b px-4 py-3">
            <RadixDialog.Title className="m-0 text-lg font-semibold">{titulo}</RadixDialog.Title>
            <RadixDialog.Close className="border-control-border rounded-control bg-surface ml-auto min-h-11 cursor-pointer border px-4">
              {cerrar}
            </RadixDialog.Close>
          </header>
          <RadixDialog.Description className="text-text-muted m-0 px-4 pt-3 text-sm">
            {descripcion}
          </RadixDialog.Description>
          <div className="p-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
