'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useFocoAlMontar } from '../../lib/correcciones/use-foco-al-montar';
import { mensajes } from '../../lib/mensajes';
import { AvisoDeDeclaracionVigente } from '../molecules/aviso-de-declaracion-vigente';
import type { TratamientoInicial } from '../molecules/campos-de-tratamiento';
import { CasillaDeAusencia } from '../molecules/casilla-de-ausencia';
import { DisparadorDelDialogo } from '../molecules/disparador-del-dialogo';
import { FormularioDeCorreccionDeTratamiento } from '../molecules/formulario-de-correccion-de-tratamiento';
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
  /** Fila vigente que se corrige (d5fb-05): el diálogo se abre precargado y ofrece solo el formulario del tratamiento. */
  corrige?: TratamientoInicial;
  /** El botón toma el foco al montarse: la fila nueva de una corrección recoge el foco de la que reemplaza. */
  enfocarAlMontar?: boolean;
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

type ContenidoProps = Pick<
  DialogoTratamientoPrevioProps,
  'pacienteId' | 'hoy' | 'alGuardar' | 'estado' | 'corrige'
> & { alCerrar: () => void };

/** Contenido del diálogo: se desmonta al cerrar, así que cada apertura empieza con el formulario del tratamiento. */
function ContenidoDelDialogo({
  pacienteId,
  hoy,
  estado,
  corrige,
  alGuardar,
  alCerrar,
}: ContenidoProps) {
  const [sinTratamiento, setSinTratamiento] = useState(false);
  const declarable =
    corrige === undefined && !estado.hayTratamientos && estado.declaracion === null;
  const alTerminar = () => {
    alGuardar();
    alCerrar();
  };
  if (corrige !== undefined) {
    return (
      <FormularioDeCorreccionDeTratamiento
        pacienteId={pacienteId}
        tratamiento={corrige}
        alGuardar={alTerminar}
        alCerrar={alCerrar}
      />
    );
  }
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

/** «+ Agregar tratamiento previo» o «Corregir dato» por fila y su diálogo (S5-03 d, d5fb-05); el foco vuelve al botón al cerrar. */
export function DialogoTratamientoPrevio({
  pacienteId,
  egresado,
  hoy,
  alGuardar,
  textoDeAccion,
  estado,
  corrige,
  enfocarAlMontar = false,
}: DialogoTratamientoPrevioProps) {
  const { accion, titulo, descripcion } = mensajes().caso.registro.tratamiento;
  const { correccion } = mensajes().caso.registro;
  const [abierto, setAbierto] = useState(false);
  const disparador = useRef<HTMLButtonElement>(null);
  useFocoAlMontar(disparador, enfocarAlMontar);
  return (
    <>
      <DisparadorDelDialogo
        ref={disparador}
        texto={textoDeAccion ?? accion}
        correccion={corrige?.regimenName}
        egresado={egresado}
        idDeAyuda="registro-egresado-tratamientos"
        alAbrir={() => setAbierto(true)}
      />
      <Dialog
        abierto={abierto}
        alCambiar={setAbierto}
        titulo={corrige === undefined ? titulo : correccion.tratamiento.titulo}
        descripcion={corrige === undefined ? descripcion : correccion.descripcion}
        retornoDeFoco={disparador}
      >
        <ContenidoDelDialogo
          pacienteId={pacienteId}
          hoy={hoy}
          estado={estado}
          corrige={corrige}
          alGuardar={alGuardar}
          alCerrar={() => setAbierto(false)}
        />
      </Dialog>
    </>
  );
}
