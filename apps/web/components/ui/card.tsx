import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

/** Superficie blanca con radio de tarjeta; con `elevada` lleva la única sombra del sistema (login). */
export function Card({
  className,
  elevada = false,
  ...props
}: ComponentProps<'div'> & { elevada?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn(
        'bg-surface p-6',
        // tailwind-merge no conoce los radios propios: se elige uno solo, no se pisan entre sí.
        elevada ? 'rounded-dialogo shadow-dialogo' : 'rounded-tarjeta',
        className,
      )}
      {...props}
    />
  );
}
