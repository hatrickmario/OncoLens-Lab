import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

/** Campo de texto de 44 px de alto (objetivo táctil, 2.5.5) con borde de control (1.4.11). */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={cn(
        'rounded-control border-control-border bg-surface text-text min-h-11 w-full border px-3 py-2',
        'aria-invalid:border-error disabled:cursor-not-allowed disabled:opacity-75',
        className,
      )}
      {...props}
    />
  );
}
