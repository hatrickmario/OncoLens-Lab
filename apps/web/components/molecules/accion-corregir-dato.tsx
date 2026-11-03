import type { Ref } from 'react';
import { mensajes, rellenar } from '../../lib/mensajes';
import { Button } from '../ui/button';

export interface AccionCorregirDatoProps {
  /** Nombre del dato, para que cada botón de una lista tenga un nombre accesible propio. */
  nombre: string;
  egresado: boolean;
  /** Id del texto de egresado que explica el botón deshabilitado (RN-17). */
  idDeAyuda: string;
  alAbrir: () => void;
  ref?: Ref<HTMLButtonElement>;
}

/** «Corregir dato»: la corrección es una acción explícita del oncólogo (RN-08); egresado → deshabilitada por regla legal. */
export function AccionCorregirDato({
  nombre,
  egresado,
  idDeAyuda,
  alAbrir,
  ref,
}: AccionCorregirDatoProps) {
  const { accion, accionDe } = mensajes().ficha.correccion;
  return (
    <Button
      ref={ref}
      variante="secundario"
      disabled={egresado}
      aria-label={rellenar(accionDe, { nombre })}
      aria-describedby={egresado ? idDeAyuda : undefined}
      onClick={alAbrir}
    >
      {accion}
    </Button>
  );
}
