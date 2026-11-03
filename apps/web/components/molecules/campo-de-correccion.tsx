import type { ComponentProps } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const CAJA =
  'rounded-control border-control-border bg-surface text-text box-border w-full border px-3 py-2';

export interface CampoDeCorreccionProps {
  id: string;
  etiqueta: string;
  /** Texto del error de este campo; el elemento `aria-live="assertive"` existe siempre, para que se anuncie al aparecer. */
  error: string | undefined;
  multilinea?: boolean;
}

/** Campo de un formulario de corrección: etiqueta visible, control y error anunciado junto al campo (AC-3). */
export function CampoDeCorreccion({
  id,
  etiqueta,
  error,
  multilinea = false,
  ...control
}: CampoDeCorreccionProps & Omit<ComponentProps<'input'>, 'id'>) {
  const idDelError = `${id}-error`;
  const accesibilidad = {
    id,
    'aria-invalid': error !== undefined,
    'aria-describedby': error === undefined ? undefined : idDelError,
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      {multilinea ? (
        <textarea
          {...(control as ComponentProps<'textarea'>)}
          {...accesibilidad}
          rows={5}
          className={`${CAJA} aria-invalid:border-error`}
        />
      ) : (
        <Input {...control} {...accesibilidad} />
      )}
      <p id={idDelError} aria-live="assertive" className="text-error m-0">
        {error}
      </p>
    </div>
  );
}
