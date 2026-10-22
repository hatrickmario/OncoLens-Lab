import type { Biomarker } from '../../../../packages/api-contracts/src/types/clinical-api';
import { formatearFecha, textoDeConfianza, textoDeOrigen } from '../../lib/ficha/presentacion';
import { mensajes, rellenar } from '../../lib/mensajes';
import { SeccionDeFicha } from '../molecules/fila-de-ficha';

const CELDA = 'border-border border-b px-3 py-2 text-left align-top';

function FilaDeBiomarcador({ b }: { b: Biomarker }) {
  const { biomarcadores, significancia, noRegistrado } = mensajes().ficha;
  return (
    <tr>
      <th scope="row" className={CELDA}>
        {b.name}
        {b.loincCode && (
          <span className="text-text-muted block text-sm font-normal">
            {rellenar(biomarcadores.loinc, { codigo: b.loincCode })}
          </span>
        )}
      </th>
      <td className={CELDA}>
        {[b.value, b.unit].filter(Boolean).join(' ')}
        <span className="text-text-muted block text-sm">{formatearFecha(b.performedAt)}</span>
      </td>
      <td className={CELDA}>{b.referenceRange ?? noRegistrado}</td>
      <td className={CELDA}>{b.trend ?? biomarcadores.sinTendencia}</td>
      <td className={CELDA}>{significancia[b.clinicalSignificance]}</td>
      <td className={CELDA}>
        <span>{textoDeOrigen(b.provenance)}</span>
        <span className="text-text-muted block text-sm">
          {textoDeConfianza(b.provenance.extractionConfidence)}
        </span>
      </td>
    </tr>
  );
}

/** Último valor por biomarcador (S2-04): significancia con símbolo y texto; origen y revisión en texto. */
export function RecentBiomarkersTable({ biomarcadores }: { biomarcadores: Biomarker[] }) {
  const { biomarcadores: textos, noRegistrado } = mensajes().ficha;
  const columnas = [
    textos.biomarcador,
    textos.valor,
    textos.rango,
    textos.tendencia,
    textos.significancia,
    textos.origen,
  ];
  return (
    <SeccionDeFicha id="ficha-biomarcadores" titulo={textos.titulo}>
      {biomarcadores.length === 0 ? (
        <p className="m-0">{noRegistrado}</p>
      ) : (
        <table className="w-full border-collapse">
          <thead className="bg-surface-alt">
            <tr>
              {columnas.map((columna) => (
                <th key={columna} scope="col" className={CELDA}>
                  {columna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {biomarcadores.map((b) => (
              <FilaDeBiomarcador key={b.id} b={b} />
            ))}
          </tbody>
        </table>
      )}
    </SeccionDeFicha>
  );
}
