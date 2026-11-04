import type { Provenance } from '../../../../packages/api-contracts/src/types/clinical-api';
import { nombreDeOrigen, textoDeOrigen } from '../../lib/ficha/presentacion';
import { FechaRelativa } from '../atoms/fecha-relativa';

/**
 * Origen de un dato de la ficha en texto. Una corrección manual se rotula «Corrección manual · {fecha relativa}» con la
 * fecha absoluta en `<time>` (S5-01); el resto, origen y revisión como siempre.
 */
export function OrigenDelDato({
  procedencia,
  fecha,
  hoy,
}: {
  procedencia: Provenance;
  fecha: string;
  hoy: string;
}) {
  if (procedencia.entryMethod !== 'manual_correction') return <>{textoDeOrigen(procedencia)}</>;
  return (
    <>
      {nombreDeOrigen('manual_correction')} · <FechaRelativa fecha={fecha} hoy={hoy} />
    </>
  );
}
