'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

export interface DialogProps {
  abierto: boolean;
  alCambiar: (abierto: boolean) => void;
  titulo: string;
  descripcion: string;
  children: ReactNode;
}

/**
 * Diálogo modal accesible (shadcn/ui sobre Radix): foco atrapado, `Esc` cierra y el foco vuelve al disparador. Lo usan
 * los formularios cortos de la ficha y de la vista de caso (S5-03); el contenido va en `children`, sin lógica propia.
 */
export function Dialog({ abierto, alCambiar, titulo, descripcion, children }: DialogProps) {
  return (
    <RadixDialog.Root open={abierto} onOpenChange={alCambiar}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <RadixDialog.Content className="bg-surface rounded-tarjeta border-border fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto border p-4 sm:p-6">
          <RadixDialog.Title className="m-0 mb-1 text-lg font-semibold">{titulo}</RadixDialog.Title>
          <RadixDialog.Description className="text-text-muted m-0 mb-4">
            {descripcion}
          </RadixDialog.Description>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
