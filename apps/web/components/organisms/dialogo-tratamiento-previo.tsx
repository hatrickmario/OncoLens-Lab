'use client';

import { useRef, useState } from 'react';
import { mensajes } from '../../lib/mensajes';
import { AccionDeRegistro } from '../molecules/accion-de-registro';
import { FormularioDeTratamientoPrevio } from '../molecules/formulario-de-tratamiento-previo';
import { Dialog } from '../ui/dialog';

export interface DialogoTratamientoPrevioProps {
  pacienteId: string;
  egresado: boolean;
  /** Recarga la vista de caso tras el `201`: la fila aparece sin recargar la página. */
  alGuardar: () => void;
}

/** «+ Agregar tratamiento previo» y su diálogo (S5-03 d); el foco vuelve al botón al cerrar. */
export function DialogoTratamientoPrevio({
  pacienteId,
  egresado,
  alGuardar,
}: DialogoTratamientoPrevioProps) {
  const { accion, titulo, descripcion } = mensajes().caso.registro.tratamiento;
  const [abierto, setAbierto] = useState(false);
  const disparador = useRef<HTMLButtonElement>(null);
  return (
    <>
      <AccionDeRegistro
        ref={disparador}
        texto={accion}
        egresado={egresado}
        idDeAyuda="registro-egresado-tratamientos"
        alAbrir={() => setAbierto(true)}
      />
      <Dialog
        abierto={abierto}
        alCambiar={setAbierto}
        titulo={titulo}
        descripcion={descripcion}
        retornoDeFoco={disparador}
      >
        <FormularioDeTratamientoPrevio
          pacienteId={pacienteId}
          alGuardar={alGuardar}
          alCerrar={() => setAbierto(false)}
        />
      </Dialog>
    </>
  );
}
