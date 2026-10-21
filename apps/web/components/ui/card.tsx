import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

interface CardProps extends ComponentProps<'div'> {
  /** `elevada` lleva el radio de diálogo y la única sombra del sistema (login). */
  variante?: 'plana' | 'elevada';
}

/** Superficie blanca con radio de tarjeta. */
export function Card({ className, variante = 'plana', ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        'rounded-tarjeta bg-surface box-border p-6',
        variante === 'elevada' && 'rounded-dialogo shadow-dialogo',
        className,
      )}
      {...props}
    />
  );
}
