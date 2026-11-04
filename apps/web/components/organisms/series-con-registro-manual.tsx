import type { ComponentProps } from 'react';
import { BiomarkerSeriesTables } from './biomarker-series-tables';
import { DialogoRegistroBiomarcador } from './dialogo-registro-biomarcador';

type Serie = ComponentProps<typeof BiomarkerSeriesTables>['series'];

export interface SeriesConRegistroManualProps {
  series: Serie;
  hoy: string;
  pacienteId: string;
  egresado: boolean;
  /** Clave de `?item=` (US-111). */
  item?: string;
  /** Recarga la vista de caso tras el `201`. */
  alGuardar: () => void;
}

/** Series de biomarcadores de la vista de caso con «Registrar biomarcador» en su encabezado (S5-03 a). */
export function SeriesConRegistroManual({
  series,
  hoy,
  pacienteId,
  egresado,
  item,
  alGuardar,
}: SeriesConRegistroManualProps) {
  return (
    <BiomarkerSeriesTables
      series={series}
      hoy={hoy}
      accion={
        <DialogoRegistroBiomarcador
          pacienteId={pacienteId}
          egresado={egresado}
          pagina="caso"
          item={item}
          idDelEncabezado="caso-series"
          alGuardar={alGuardar}
        />
      }
    />
  );
}
