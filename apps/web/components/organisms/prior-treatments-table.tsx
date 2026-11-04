import type { ReactNode } from 'react';
import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { rotuloOValor } from '../../lib/caso/presentacion';
import { mensajes } from '../../lib/mensajes';
import { FechaRelativaOpcional } from '../atoms/fecha-relativa';
import { CELDA, EncabezadoDeTabla } from '../molecules/encabezado-de-tabla';
import { SeccionDeFicha } from '../molecules/fila-de-ficha';
import { ProcedenciaDelDato } from '../molecules/procedencia-del-dato';

type Tratamiento = CaseView['priorTreatments'][number];

function FilaDeTratamiento({ t, hoy }: { t: Tratamiento; hoy: string }) {
  const { caso, ficha } = mensajes();
  return (
    <tr>
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
    </tr>
  );
}

/** Tratamientos previos (línea, contexto, esquema, inicio, fin u «En curso», origen) en el orden del servidor. */
export function PriorTreatmentsTable({
  tratamientos,
  hoy,
  accion,
}: {
  tratamientos: Tratamiento[];
  hoy: string;
  accion?: ReactNode;
}) {
  const { caso } = mensajes();
  const c = caso.columnas;
  return (
    <SeccionDeFicha id="caso-tratamientos" titulo={caso.secciones.tratamientos} accion={accion}>
      {tratamientos.length === 0 ? (
        <p className="m-0">{caso.sinDatos}</p>
      ) : (
        <table className="w-full border-collapse">
          <EncabezadoDeTabla
            columnas={[c.linea, c.contexto, c.esquema, c.inicio, c.fin, c.origen]}
          />
          <tbody>
            {tratamientos.map((t) => (
              <FilaDeTratamiento key={`${t.regimenName}-${t.startedAt}`} t={t} hoy={hoy} />
            ))}
          </tbody>
        </table>
      )}
    </SeccionDeFicha>
  );
}
