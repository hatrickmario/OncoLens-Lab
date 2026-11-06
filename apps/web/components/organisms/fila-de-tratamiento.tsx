import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { rotuloOValor } from '../../lib/caso/presentacion';
import { mensajes } from '../../lib/mensajes';
import { FechaRelativaOpcional } from '../atoms/fecha-relativa';
import { CELDA } from '../molecules/encabezado-de-tabla';
import { FilaConHistorico } from '../molecules/fila-con-historico';
import { HistoricoDelDato } from '../molecules/historico-del-dato';
import { ProcedenciaDelDato } from '../molecules/procedencia-del-dato';
import { DialogoTratamientoPrevio, type EstadoDeTratamientos } from './dialogo-tratamiento-previo';

type Tratamiento = CaseView['priorTreatments'][number];

export interface FilaDeTratamientoProps {
  t: Tratamiento;
  hoy: string;
  pacienteId: string;
  egresado: boolean;
  estado: EstadoDeTratamientos;
  /** La fila acaba de sustituir al dato corregido: su botón recoge el foco. */
  enfocar: boolean;
  alGuardar: () => void;
}

/** Un tratamiento previo (línea, contexto, esquema, inicio, fin u «En curso», origen) con «Corregir dato» y su histórico. */
export function FilaDeTratamiento({
  t,
  hoy,
  pacienteId,
  egresado,
  estado,
  enfocar,
  alGuardar,
}: FilaDeTratamientoProps) {
  const { caso, ficha } = mensajes();
  const dato = { pacienteId, dato: 'prior-treatments', id: t.id } as const;
  return (
    <FilaConHistorico
      columnas={6}
      accion={
        <DialogoTratamientoPrevio
          pacienteId={pacienteId}
          egresado={egresado}
          hoy={hoy}
          estado={estado}
          corrige={t}
          enfocarAlMontar={enfocar}
          alGuardar={alGuardar}
        />
      }
      historico={t.supersedesId ? <HistoricoDelDato dato={dato} hoy={hoy} /> : null}
    >
      <td className={CELDA}>{t.lineNumber ?? ficha.noRegistrado}</td>
      <td className={CELDA}>{rotuloOValor(caso.contextos, t.setting)}</td>
      <th scope="row" className={`${CELDA} font-semibold`}>
        {t.regimenName}
        <span className="text-text-muted block text-sm font-normal">
          {t.atcCodes.length > 0 ? t.atcCodes.join(', ') : caso.noMapeado}
        </span>
      </th>
      <td className={CELDA}>
        <FechaRelativaOpcional fecha={t.startedAt} hoy={hoy} />
      </td>
      <td className={CELDA}>
        {t.ongoing ? caso.enCurso : <FechaRelativaOpcional fecha={t.endedAt} hoy={hoy} />}
        {!t.ongoing && (
          <span className="text-text-muted block text-sm">
            {rotuloOValor(caso.motivosDeFin, t.endReason)}
          </span>
        )}
      </td>
      <td className={CELDA}>
        <ProcedenciaDelDato procedencia={t.provenance} />
      </td>
    </FilaConHistorico>
  );
}
