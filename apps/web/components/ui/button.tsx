import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

const variantes = cva(
  'box-border inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control px-4 font-semibold disabled:cursor-progress disabled:opacity-75',
  {
    variants: {
      variante: {
        primario: 'bg-primary text-white',
        secundario: 'border border-control-border bg-surface text-text',
        fantasma: 'bg-transparent text-primary',
      },
    },
    defaultVariants: { variante: 'primario' },
  },
);

export function Button({
  className,
  variante,
  type = 'button',
  ...props
}: ComponentProps<'button'> & VariantProps<typeof variantes>) {
  return (
    <button
      data-slot="button"
      type={type}
      className={cn(variantes({ variante }), className)}
      {...props}
    />
  );
}
