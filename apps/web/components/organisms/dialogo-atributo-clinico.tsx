'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useAtributosPermitidos } from '../../lib/registro-manual/use-atributos-permitidos';
import { mensajes } from '../../lib/mensajes';
import { AccionDeRegistro } from '../molecules/accion-de-registro';
import { FormularioDeAtributoClinico } from '../molecules/formulario-de-atributo-clinico';
import { Dialog } from '../ui/dialog';

export interface DialogoAtributoClinicoProps {
  pacienteId: string;
  egresado: boolean;
  /** Recarga la vista de caso tras el `201`: la fila aparece sin recargar la página. */
  alGuardar: () => void;
  /** Atributo del catálogo que el formulario abre seleccionado (p. ej., desde un faltante); sin él, ninguno. */
  claveInicial?: string;
  /** Texto del botón que abre el diálogo; por defecto «+ Registrar atributo». */
  textoDeAccion?: ReactNode;
}

/** Contenido del diálogo: lee los atributos del catálogo al abrirse (el contenido se desmonta al cerrar). */
function ContenidoDelAtributo({
  pacienteId,
  claveInicial,
  alGuardar,
  alCerrar,
}: {
  pacienteId: string;
  claveInicial?: string;
  alGuardar: () => void;
  alCerrar: () => void;
}) {
  const { atributo } = mensajes().caso.registro;
  const lectura = useAtributosPermitidos(pacienteId);
  if (lectura === null) {
    return (
      <p role="status" aria-busy="true" className="m-0">
        {atributo.cargando}
      </p>
    );
  }
  if (lectura.tipo === 'error') return <p className="m-0">{atributo.noDisponibles}</p>;
  if (lectura.permitidos.length === 0) return <p className="m-0">{atributo.sinAtributos}</p>;
  return (
    <FormularioDeAtributoClinico
      pacienteId={pacienteId}
      permitidos={lectura.permitidos}
      claveInicial={claveInicial}
      alGuardar={() => {
        alGuardar();
        alCerrar();
      }}
      alCerrar={alCerrar}
    />
  );
}

/** «+ Registrar atributo» y su diálogo (S5-03 c); el foco vuelve al botón al cerrar. */
export function DialogoAtributoClinico({
  pacienteId,
  egresado,
  alGuardar,
  claveInicial,
  textoDeAccion,
}: DialogoAtributoClinicoProps) {
  const { accion, titulo, descripcion } = mensajes().caso.registro.atributo;
  const [abierto, setAbierto] = useState(false);
  const disparador = useRef<HTMLButtonElement>(null);
  return (
    <>
      <AccionDeRegistro
        ref={disparador}
        texto={textoDeAccion ?? accion}
        egresado={egresado}
        idDeAyuda="registro-egresado-atributos"
        alAbrir={() => setAbierto(true)}
      />
      <Dialog
        abierto={abierto}
        alCambiar={setAbierto}
        titulo={titulo}
        descripcion={descripcion}
        retornoDeFoco={disparador}
      >
        <ContenidoDelAtributo
          pacienteId={pacienteId}
          claveInicial={claveInicial}
          alGuardar={alGuardar}
          alCerrar={() => setAbierto(false)}
        />
      </Dialog>
    </>
  );
}
