import type { Biomarker } from '../../../../packages/api-contracts/src/types/clinical-api';
import { textoDeConfianza } from '../../lib/ficha/presentacion';
import { mensajes, rellenar } from '../../lib/mensajes';
import { FechaRelativa } from '../atoms/fecha-relativa';
import { CELDA } from '../molecules/encabezado-de-tabla';
import { SeccionDeFicha } from '../molecules/fila-de-ficha';
import { OrigenDelDato } from '../molecules/origen-del-dato';
import { TablaDeBiomarcadoresCorregibles } from '../molecules/tabla-de-biomarcadores-corregibles';

const ID_DE_AYUDA = 'correccion-egresado-biomarcadores';

function CeldasDeBiomarcador({ b, hoy }: { b: Biomarker; hoy: string }) {
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
        <span className="text-text-muted block text-sm">
          <FechaRelativa fecha={b.performedAt} hoy={hoy} />
        </span>
      </td>
      <td className={CELDA}>{b.referenceRange ?? noRegistrado}</td>
      <td className={CELDA}>{b.trend ?? biomarcadores.sinTendencia}</td>
      <td className={CELDA}>{significancia[b.clinicalSignificance]}</td>
      <td className={CELDA}>
        <span>
          <OrigenDelDato procedencia={b.provenance} fecha={b.performedAt} hoy={hoy} />
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
  /** «Hoy» del servidor para las fechas relativas. */
  hoy: string;
}

/** Último valor por biomarcador (S2-04): significancia, origen y revisión en texto; cada dato se puede corregir (US-253). */
export function RecentBiomarkersTable({
  biomarcadores,
  pacienteId,
  egresado,
  hoy,
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
          <TablaDeBiomarcadoresCorregibles
            columnas={columnas}
            columnaDeAcciones={textos.acciones}
            filas={biomarcadores.map((b) => ({
              biomarcador: b,
              celdas: <CeldasDeBiomarcador b={b} hoy={hoy} />,
            }))}
            pacienteId={pacienteId}
            egresado={egresado}
            idDeAyuda={ID_DE_AYUDA}
            hoy={hoy}
          />
        </>
      )}
    </SeccionDeFicha>
  );
}
