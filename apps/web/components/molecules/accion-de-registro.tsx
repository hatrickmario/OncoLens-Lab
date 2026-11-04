import type { Ref } from 'react';
import { mensajes } from '../../lib/mensajes';
import { Button } from '../ui/button';

export interface AccionDeRegistroProps {
  texto: string;
  egresado: boolean;
  /** Id del texto de egresado que explica el botón deshabilitado (RN-17). */
  idDeAyuda: string;
  alAbrir: () => void;
  ref?: Ref<HTMLButtonElement>;
}

/** «+ Agregar…» / «+ Registrar…» de una sección del caso; egresado → deshabilitado por regla legal, con su explicación visible. */
export function AccionDeRegistro({
  texto,
  egresado,
  idDeAyuda,
  alAbrir,
  ref,
}: AccionDeRegistroProps) {
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        ref={ref}
        variante="secundario"
        disabled={egresado}
        aria-describedby={egresado ? idDeAyuda : undefined}
        onClick={alAbrir}
      >
        {texto}
      </Button>
      {egresado && (
        <p id={idDeAyuda} className="text-text-muted m-0 text-sm">
          {mensajes().ficha.correccion.egresado}
        </p>
      )}
    </div>
  );
}
