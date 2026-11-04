import type { ReactNode } from 'react';
import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { valorConUnidad } from '../../lib/caso/presentacion';
import { mensajes } from '../../lib/mensajes';
import { FechaRelativa } from '../atoms/fecha-relativa';
import { CELDA, EncabezadoDeTabla } from '../molecules/encabezado-de-tabla';
import { SeccionDeFicha } from '../molecules/fila-de-ficha';
import { ProcedenciaDelDato } from '../molecules/procedencia-del-dato';

type Serie = CaseView['biomarkerSeries'][number];

function TablaDeSerie({ serie, hoy }: { serie: Serie; hoy: string }) {
  const c = mensajes().caso.columnas;
  return (
    <table className="mb-4 w-full border-collapse">
      <caption className="mb-1 text-left font-semibold">{serie.name}</caption>
      <EncabezadoDeTabla columnas={[c.fecha, c.valor, c.origen]} />
      <tbody>
        {serie.points.map((p) => (
          <tr key={`${p.performedAt}-${p.value}`}>
            <td className={CELDA}>
              <FechaRelativa fecha={p.performedAt} hoy={hoy} />
            </td>
            <td className={CELDA}>{valorConUnidad(p.value, p.unit)}</td>
            <td className={CELDA}>
              <ProcedenciaDelDato procedencia={p.provenance} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Una tabla por serie de biomarcador (fecha, valor con unidad, origen); el gráfico llega con US-089 (D-8). */
export function BiomarkerSeriesTables({
  series,
  hoy,
  accion,
}: {
  series: Serie[];
  hoy: string;
  /** Acción de la sección («Registrar biomarcador»), a la derecha del título. */
  accion?: ReactNode;
}) {
  const { secciones, sinDatos } = mensajes().caso;
  return (
    <SeccionDeFicha id="caso-series" titulo={secciones.series} accion={accion}>
      {series.length === 0 ? (
        <p className="m-0">{sinDatos}</p>
      ) : (
        series.map((s) => <TablaDeSerie key={s.name} serie={s} hoy={hoy} />)
      )}
    </SeccionDeFicha>
  );
}
