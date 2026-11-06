'use client';

import { useRef, useState, type ReactNode } from 'react';
import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { rotuloOValor } from '../../lib/caso/presentacion';
import { useFocoAlMontar } from '../../lib/correcciones/use-foco-al-montar';
import { CLAVE_DE_DECLARACION } from '../../lib/registro-manual/declaracion-de-ausencia';
import { mensajes } from '../../lib/mensajes';
import { DisparadorDelDialogo } from '../molecules/disparador-del-dialogo';
import { Dialog } from '../ui/dialog';
import { ContenidoDelDialogoDeAtributo } from './contenido-del-dialogo-de-atributo';

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
        <ContenidoDelDialogoDeAtributo
          {...contenido}
          claveInicial={claveInicial}
          corrige={corrige}
        />
      </Dialog>
    </>
  );
}
