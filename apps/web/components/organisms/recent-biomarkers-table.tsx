import type { Biomarker } from '../../../../packages/api-contracts/src/types/clinical-api';
import { formatearFecha, textoDeConfianza } from '../../lib/ficha/presentacion';
import { mensajes, rellenar } from '../../lib/mensajes';
import { BiomarcadorCorregible } from '../molecules/biomarcador-corregible';
import { SeccionDeFicha } from '../molecules/fila-de-ficha';
import { OrigenDelDato } from '../molecules/origen-del-dato';

const CELDA = 'border-border border-b px-3 py-2 text-left align-top';
const ID_DE_AYUDA = 'correccion-egresado-biomarcadores';

function CeldasDeBiomarcador({ b }: { b: Biomarker }) {
  const { biomarcadores, significancia, noRegistrado } = mensajes().ficha;
  return (
    <>
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
        <span>
          <OrigenDelDato procedencia={b.provenance} fecha={b.performedAt} />
        </span>
        <span className="text-text-muted block text-sm">
          {textoDeConfianza(b.provenance.extractionConfidence)}
        </span>
      </td>
    </>
  );
}

export interface RecentBiomarkersTableProps {
  biomarcadores: Biomarker[];
  pacienteId: string;
  /** Paciente egresado: la corrección queda deshabilitada por regla legal (RN-17). */
  egresado: boolean;
}

/** Último valor por biomarcador (S2-04): significancia, origen y revisión en texto; cada dato se puede corregir (US-253). */
export function RecentBiomarkersTable({
  biomarcadores,
  pacienteId,
  egresado,
}: RecentBiomarkersTableProps) {
  const { biomarcadores: textos, noRegistrado, correccion } = mensajes().ficha;
  const columnas = [
    textos.biomarcador,
    textos.valor,
    textos.rango,
    textos.tendencia,
    textos.significancia,
    textos.origen,
  ];
  return (
    <SeccionDeFicha id="biomarcadores" titulo={textos.titulo}>
      {biomarcadores.length === 0 ? (
        <p className="m-0">{noRegistrado}</p>
      ) : (
        <>
          {egresado && (
            <p id={ID_DE_AYUDA} className="m-0 mb-2">
              {correccion.egresado}
            </p>
          )}
          <table className="w-full border-collapse">
            <thead className="bg-surface-alt">
              <tr>
                {columnas.map((columna) => (
                  <th key={columna} scope="col" className={CELDA}>
                    {columna}
                  </th>
                ))}
                <th scope="col" className={`${CELDA} relative`}>
                  <span className="sr-only">{textos.acciones}</span>
                </th>
              </tr>
            </thead>
            {biomarcadores.map((b) => (
              <BiomarcadorCorregible
                key={b.name}
                biomarcador={b}
                pacienteId={pacienteId}
                egresado={egresado}
                idDeAyuda={ID_DE_AYUDA}
                columnas={columnas.length}
              >
                <CeldasDeBiomarcador b={b} />
              </BiomarcadorCorregible>
            ))}
          </table>
        </>
      )}
    </SeccionDeFicha>
  );
}
