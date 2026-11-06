'use client';

import { useRef, useState, type ReactNode } from 'react';
import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { rotuloOValor } from '../../lib/caso/presentacion';
import { useFocoAlMontar } from '../../lib/correcciones/use-foco-al-montar';
import { CLAVE_DE_DECLARACION } from '../../lib/registro-manual/declaracion-de-ausencia';
import { useAtributosPermitidos } from '../../lib/registro-manual/use-atributos-permitidos';
import { mensajes } from '../../lib/mensajes';
import { DisparadorDelDialogo } from '../molecules/disparador-del-dialogo';
import { FormularioDeAtributoClinico } from '../molecules/formulario-de-atributo-clinico';
import { FormularioDeCorreccionDeAtributo } from '../molecules/formulario-de-correccion-de-atributo';
import { Dialog } from '../ui/dialog';

type Atributo = CaseView['attributes'][number];

export interface DialogoAtributoClinicoProps {
  pacienteId: string;
  egresado: boolean;
  /** Recarga la vista de caso tras el `201`: la fila aparece sin recargar la página. */
  alGuardar: () => void;
  /** Atributo del catálogo que el formulario abre seleccionado (p. ej., desde un faltante); sin él, ninguno. */
  claveInicial?: string;
  /** Texto del botón que abre el diálogo; por defecto «+ Registrar atributo». */
  textoDeAccion?: ReactNode;
  /** Fila vigente que se corrige (d5fb-05): el diálogo se abre precargado, con la clave fija. */
  corrige?: Atributo;
  /** El botón toma el foco al montarse: la fila nueva de una corrección recoge el foco de la que reemplaza. */
  enfocarAlMontar?: boolean;
}

type ContenidoProps = Pick<DialogoAtributoClinicoProps, 'pacienteId' | 'alGuardar'> & {
  alCerrar: () => void;
};

/** Contenido del diálogo: lee los atributos del catálogo al abrirse (el contenido se desmonta al cerrar). */
function ContenidoDelAtributo({
  pacienteId,
  claveInicial,
  corrige,
  alGuardar,
  alCerrar,
}: ContenidoProps & Pick<DialogoAtributoClinicoProps, 'claveInicial' | 'corrige'>) {
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
  const alTerminar = () => {
    alGuardar();
    alCerrar();
  };
  if (corrige !== undefined) {
    return (
      <FormularioDeCorreccionDeAtributo
        pacienteId={pacienteId}
        atributo={corrige}
        valores={lectura.permitidos.find((a) => a.key === corrige.key)?.values ?? []}
        alGuardar={alTerminar}
        alCerrar={alCerrar}
      />
    );
  }
  return (
    <FormularioDeAtributoClinico
      pacienteId={pacienteId}
      permitidos={lectura.permitidos}
      claveInicial={claveInicial}
      alGuardar={alTerminar}
      alCerrar={alCerrar}
    />
  );
}

/** La declaración de ausencia solo cambia de fecha: no necesita el catálogo ni puede quedar sin él. */
function ContenidoDeLaDeclaracion({
  pacienteId,
  corrige,
  alGuardar,
  alCerrar,
}: ContenidoProps & { corrige: Atributo }) {
  return (
    <FormularioDeCorreccionDeAtributo
      pacienteId={pacienteId}
      atributo={corrige}
      valores={null}
      alGuardar={() => {
        alGuardar();
        alCerrar();
      }}
      alCerrar={alCerrar}
    />
  );
}

/** Nombre del dato en «Corregir dato · {nombre}»: el rótulo de la clave, o el de la declaración de ausencia. */
function nombreDelAtributo(atributo: Atributo): string {
  const { caso } = mensajes();
  return atributo.key === CLAVE_DE_DECLARACION
    ? caso.registro.tratamiento.declaracion.sinTratamiento
    : rotuloOValor(caso.atributosClave, atributo.key);
}

function titulos(corrige: Atributo | undefined) {
  const { atributo, correccion } = mensajes().caso.registro;
  if (corrige === undefined) return { titulo: atributo.titulo, descripcion: atributo.descripcion };
  const titulo =
    corrige.key === CLAVE_DE_DECLARACION
      ? correccion.declaracion.titulo
      : correccion.atributo.titulo;
  return { titulo, descripcion: correccion.descripcion };
}

/** «+ Registrar atributo» o «Corregir dato» por fila y su diálogo (S5-03 c, d5fb-05); el foco vuelve al botón al cerrar. */
export function DialogoAtributoClinico({
  pacienteId,
  egresado,
  alGuardar,
  claveInicial,
  textoDeAccion,
  corrige,
  enfocarAlMontar = false,
}: DialogoAtributoClinicoProps) {
  const [abierto, setAbierto] = useState(false);
  const disparador = useRef<HTMLButtonElement>(null);
  useFocoAlMontar(disparador, enfocarAlMontar);
  const esDeclaracion = corrige?.key === CLAVE_DE_DECLARACION;
  const contenido = { pacienteId, alGuardar, alCerrar: () => setAbierto(false) };
  const { atributo } = mensajes().caso.registro;
  return (
    <>
      <DisparadorDelDialogo
        ref={disparador}
        texto={textoDeAccion ?? atributo.accion}
        correccion={corrige && nombreDelAtributo(corrige)}
        egresado={egresado}
        idDeAyuda={esDeclaracion ? 'registro-egresado-tratamientos' : 'registro-egresado-atributos'}
        alAbrir={() => setAbierto(true)}
      />
      <Dialog
        abierto={abierto}
        alCambiar={setAbierto}
        retornoDeFoco={disparador}
        {...titulos(corrige)}
      >
        {esDeclaracion ? (
          <ContenidoDeLaDeclaracion {...contenido} corrige={corrige} />
        ) : (
          <ContenidoDelAtributo {...contenido} claveInicial={claveInicial} corrige={corrige} />
        )}
      </Dialog>
    </>
  );
}
