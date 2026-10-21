import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

/**
 * Aviso de error (el rojo se reserva al error, sistema de diseño §1). `role="alert"` por defecto;
 * un aviso informativo que no interrumpa pasará `role="status"`.
 */
export function Alert({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn('rounded-control border-error bg-error-bg text-error border p-3', className)}
      {...props}
    />
  );
}
