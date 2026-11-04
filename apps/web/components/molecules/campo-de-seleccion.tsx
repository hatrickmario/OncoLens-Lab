import type { ComponentProps } from 'react';
import { Label } from '../ui/label';

export interface CampoDeSeleccionProps {
  id: string;
  etiqueta: string;
  /** Texto del error de este campo; el elemento `aria-live="assertive"` existe siempre, para que se anuncie al aparecer. */
  error: string | undefined;
}

/** Lista desplegable de un formulario de registro: etiqueta visible, control nativo y error anunciado junto al campo. */
export function CampoDeSeleccion({
  id,
  etiqueta,
  error,
  children,
  ...control
}: CampoDeSeleccionProps & Omit<ComponentProps<'select'>, 'id'>) {
  const idDelError = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      <select
        {...control}
        id={id}
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : idDelError}
        className="rounded-control border-control-border bg-surface text-text aria-invalid:border-error box-border min-h-11 w-full border px-3"
      >
        {children}
      </select>
      <p id={idDelError} aria-live="assertive" className="text-error m-0">
        {error}
      </p>
    </div>
  );
}
