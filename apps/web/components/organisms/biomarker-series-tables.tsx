import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { valorConUnidad } from '../../lib/caso/presentacion';
import { mensajes } from '../../lib/mensajes';
import { FechaRelativa } from '../atoms/fecha-relativa';
import { SeccionDeFicha } from '../molecules/fila-de-ficha';
import { ProcedenciaDelDato } from '../molecules/procedencia-del-dato';

type Serie = CaseView['biomarkerSeries'][number];

const CELDA = 'border-border border-b px-3 py-2 text-left align-top';

function TablaDeSerie({ serie, hoy }: { serie: Serie; hoy: string }) {
  const c = mensajes().caso.columnas;
  return (
    <table className="mb-4 w-full border-collapse">
      <caption className="mb-1 text-left font-semibold">{serie.name}</caption>
      <thead className="bg-surface-alt">
        <tr>
          {[c.fecha, c.valor, c.origen].map((columna) => (
            <th key={columna} scope="col" className={CELDA}>
              {columna}
            </th>
          ))}
        </tr>
      </thead>
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
export function BiomarkerSeriesTables({ series, hoy }: { series: Serie[]; hoy: string }) {
  const { secciones, sinDatos } = mensajes().caso;
  return (
    <SeccionDeFicha id="caso-series" titulo={secciones.series}>
      {series.length === 0 ? (
        <p className="m-0">{sinDatos}</p>
      ) : (
        series.map((s) => <TablaDeSerie key={s.name} serie={s} hoy={hoy} />)
      )}
    </SeccionDeFicha>
  );
}
