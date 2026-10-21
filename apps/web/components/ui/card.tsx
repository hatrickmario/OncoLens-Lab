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
        'rounded-tarjeta bg-surface p-6',
        elevada && 'rounded-dialogo shadow-dialogo',
        className,
      )}
      {...props}
    />
  );
}
