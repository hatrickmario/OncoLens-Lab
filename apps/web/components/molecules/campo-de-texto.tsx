import type { ComponentProps } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const CAJA =
  'rounded-control border-control-border bg-surface text-text box-border w-full border px-3 py-2';

export interface CampoDeTextoProps {
  id: string;
  etiqueta: string;
  /** Texto del error de este campo; el elemento `aria-live="assertive"` existe siempre, para que se anuncie al aparecer. */
  error: string | undefined;
  multilinea?: boolean;
  /** Texto de ayuda visible, enlazado al control con `aria-describedby`. */
  ayuda?: string;
}

/** Campo de texto, número o fecha de un formulario (corrección o registro manual): etiqueta visible, control y error anunciado junto al campo (AC-3). */
export function CampoDeTexto({
  id,
  etiqueta,
  error,
  multilinea = false,
  ayuda,
  ...control
}: CampoDeTextoProps & Omit<ComponentProps<'input'>, 'id'>) {
  const idDelError = `${id}-error`;
  const idDeAyuda = `${id}-ayuda`;
  const descritoPor = [ayuda && idDeAyuda, error !== undefined && idDelError].filter(Boolean);
  const accesibilidad = {
    id,
    'aria-invalid': error !== undefined,
    'aria-describedby': descritoPor.length > 0 ? descritoPor.join(' ') : undefined,
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
      {ayuda && (
        <p id={idDeAyuda} className="text-text-muted m-0 text-sm">
          {ayuda}
        </p>
      )}
      <p id={idDelError} aria-live="assertive" className="text-error m-0">
        {error}
      </p>
    </div>
  );
}
