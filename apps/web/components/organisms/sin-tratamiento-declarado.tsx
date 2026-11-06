import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../../lib/mensajes';
import { FechaRelativaOpcional } from '../atoms/fecha-relativa';
import { HistoricoDelDato } from '../molecules/historico-del-dato';
import { ProcedenciaDelDato } from '../molecules/procedencia-del-dato';
import { DialogoAtributoClinico } from './dialogo-atributo-clinico';

type Declaracion = CaseView['attributes'][number];

export interface SinTratamientoDeclaradoProps {
  declaracion: Declaracion;
  hoy: string;
  pacienteId: string;
  egresado: boolean;
  /** La declaración acaba de sustituir a la corregida: su botón recoge el foco. */
  enfocar: boolean;
  alGuardar: () => void;
}

/**
 * «Sin tratamiento previo a la fecha» con su fecha relativa y su origen: un hecho declarado, distinto de «Sin datos».
 * Se corrige como un atributo más, pero solo cambia su fecha (d5fb-05, D12).
 */
export function SinTratamientoDeclarado({
  declaracion,
  hoy,
  pacienteId,
  egresado,
  enfocar,
  alGuardar,
}: SinTratamientoDeclaradoProps) {
  const { declaracion: d } = mensajes().caso.registro.tratamiento;
  const dato = { pacienteId, dato: 'clinical-attributes', id: declaracion.id } as const;
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <p className="m-0">
        <span className="font-semibold">{d.sinTratamiento}</span>{' '}
        <span className="text-text-muted text-sm">
          (<FechaRelativaOpcional fecha={declaracion.observedAt} hoy={hoy} />) ·{' '}
          <ProcedenciaDelDato procedencia={declaracion.provenance} />
        </span>
      </p>
      <DialogoAtributoClinico
        pacienteId={pacienteId}
        egresado={egresado}
        corrige={declaracion}
        enfocarAlMontar={enfocar}
        alGuardar={alGuardar}
      />
      {declaracion.supersedesId && <HistoricoDelDato dato={dato} hoy={hoy} />}
    </div>
  );
}
