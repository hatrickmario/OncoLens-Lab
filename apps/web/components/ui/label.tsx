'use client';

import * as RadixLabel from '@radix-ui/react-label';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function Label({ className, ...props }: ComponentProps<typeof RadixLabel.Root>) {
  return (
    <RadixLabel.Root
      data-slot="label"
      className={cn('text-text font-semibold', className)}
      {...props}
    />
  );
}
