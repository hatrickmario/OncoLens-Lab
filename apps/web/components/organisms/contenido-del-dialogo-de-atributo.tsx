'use client';

import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { CLAVE_DE_DECLARACION } from '../../lib/registro-manual/declaracion-de-ausencia';
import { useAtributosPermitidos } from '../../lib/registro-manual/use-atributos-permitidos';
import { mensajes } from '../../lib/mensajes';
import { FormularioDeAtributoClinico } from '../molecules/formulario-de-atributo-clinico';
import { FormularioDeCorreccionDeAtributo } from '../molecules/formulario-de-correccion-de-atributo';

type Atributo = CaseView['attributes'][number];

export interface ContenidoDelDialogoDeAtributoProps {
  pacienteId: string;
  /** Atributo del catálogo que el alta abre seleccionado; sin él, ninguno. */
  claveInicial?: string;
  /** Fila vigente que se corrige; sin ella, el contenido es el alta. */
  corrige?: Atributo;
  alGuardar: () => void;
  alCerrar: () => void;
}

/** Contenido del diálogo: lee los atributos del catálogo al abrirse (el contenido se desmonta al cerrar). */
function ContenidoConCatalogo({
  pacienteId,
  claveInicial,
  corrige,
  alGuardar,
  alCerrar,
}: ContenidoDelDialogoDeAtributoProps) {
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
  if (corrige !== undefined) {
    return (
      <FormularioDeCorreccionDeAtributo
        pacienteId={pacienteId}
        atributo={corrige}
        valores={lectura.permitidos.find((a) => a.key === corrige.key)?.values ?? []}
        alGuardar={alGuardar}
        alCerrar={alCerrar}
      />
    );
  }
  return (
    <FormularioDeAtributoClinico
      pacienteId={pacienteId}
      permitidos={lectura.permitidos}
      claveInicial={claveInicial}
      alGuardar={alGuardar}
      alCerrar={alCerrar}
    />
  );
}

/**
 * Alta o corrección de un atributo. La declaración de ausencia solo cambia de fecha: no necesita el catálogo ni puede
 * quedar bloqueada por él.
 */
export function ContenidoDelDialogoDeAtributo({
  corrige,
  alGuardar,
  alCerrar,
  ...resto
}: ContenidoDelDialogoDeAtributoProps) {
  const alTerminar = () => {
    alGuardar();
    alCerrar();
  };
  if (corrige?.key === CLAVE_DE_DECLARACION) {
    return (
      <FormularioDeCorreccionDeAtributo
        pacienteId={resto.pacienteId}
        atributo={corrige}
        valorFijo={corrige.value}
        alGuardar={alTerminar}
        alCerrar={alCerrar}
      />
    );
  }
  return (
    <ContenidoConCatalogo {...resto} corrige={corrige} alGuardar={alTerminar} alCerrar={alCerrar} />
  );
}
