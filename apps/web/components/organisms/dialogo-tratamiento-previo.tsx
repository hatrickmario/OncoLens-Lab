'use client';

import { useRef, useState, type ReactNode } from 'react';
import { mensajes } from '../../lib/mensajes';
import { AccionDeRegistro } from '../molecules/accion-de-registro';
import { AvisoDeDeclaracionVigente } from '../molecules/aviso-de-declaracion-vigente';
import { CasillaDeAusencia } from '../molecules/casilla-de-ausencia';
import { FormularioDeDeclaracionDeAusencia } from '../molecules/formulario-de-declaracion-de-ausencia';
import { FormularioDeTratamientoPrevio } from '../molecules/formulario-de-tratamiento-previo';
import { Dialog } from '../ui/dialog';

export interface DialogoTratamientoPrevioProps {
  pacienteId: string;
  egresado: boolean;
  /** «Hoy» del servidor: fecha por defecto y tope de la declaración de ausencia. */
  hoy: string;
  /** Recarga la vista de caso tras el `201`: la fila aparece sin recargar la página. */
  alGuardar: () => void;
  /** Texto del botón que abre el diálogo; por defecto «+ Agregar tratamiento previo». */
  textoDeAccion?: ReactNode;
  /** Obligatorio: lo que ya hay registrado decide qué ofrece el diálogo (nunca «abierto» por omisión). */
  estado: EstadoDeTratamientos;
}

/**
 * Lo registrado del paciente que condiciona el diálogo: con tratamientos vigentes no se ofrece declarar su ausencia (una
 * sola verdad); con una declaración vigente (con o sin fecha) registrar un tratamiento la reemplaza.
 */
export interface EstadoDeTratamientos {
  hayTratamientos: boolean;
  declaracion: { observedAt: string | null } | null;
}

/** Estado de un faltante «Tratamientos previos»: un faltante implica que no hay tratamientos ni declaración. */
export const ESTADO_DE_FALTANTE: EstadoDeTratamientos = {
  hayTratamientos: false,
  declaracion: null,
};

/** Contenido del diálogo: se desmonta al cerrar, así que cada apertura empieza con el formulario del tratamiento. */
function ContenidoDelDialogo({
  pacienteId,
  hoy,
  estado,
  alGuardar,
  alCerrar,
}: Pick<DialogoTratamientoPrevioProps, 'pacienteId' | 'hoy' | 'alGuardar' | 'estado'> & {
  alCerrar: () => void;
}) {
  const [sinTratamiento, setSinTratamiento] = useState(false);
  const declarable = !estado.hayTratamientos && estado.declaracion === null;
  const alTerminar = () => {
    alGuardar();
    alCerrar();
  };
  return (
    <>
      {estado.declaracion !== null && (
        <AvisoDeDeclaracionVigente observedAt={estado.declaracion.observedAt} />
      )}
      {declarable && <CasillaDeAusencia marcada={sinTratamiento} alCambiar={setSinTratamiento} />}
      {declarable && sinTratamiento ? (
        <FormularioDeDeclaracionDeAusencia
          pacienteId={pacienteId}
          hoy={hoy}
          alGuardar={alTerminar}
          alCerrar={alCerrar}
        />
      ) : (
        <FormularioDeTratamientoPrevio
          pacienteId={pacienteId}
          alGuardar={alGuardar}
          alCerrar={alCerrar}
        />
      )}
    </>
  );
}

/** «+ Agregar tratamiento previo» y su diálogo (S5-03 d); el foco vuelve al botón al cerrar. */
export function DialogoTratamientoPrevio({
  pacienteId,
  egresado,
  hoy,
  alGuardar,
  textoDeAccion,
  estado,
}: DialogoTratamientoPrevioProps) {
  const { accion, titulo, descripcion } = mensajes().caso.registro.tratamiento;
  const [abierto, setAbierto] = useState(false);
  const disparador = useRef<HTMLButtonElement>(null);
  return (
    <>
      <AccionDeRegistro
        ref={disparador}
        texto={textoDeAccion ?? accion}
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
        <ContenidoDelDialogo
          pacienteId={pacienteId}
          hoy={hoy}
          estado={estado}
          alGuardar={alGuardar}
          alCerrar={() => setAbierto(false)}
        />
      </Dialog>
    </>
  );
}
