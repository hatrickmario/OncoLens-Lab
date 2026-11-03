import type { Provenance } from '../../../../packages/api-contracts/src/types/clinical-api';
import { fechaRelativa } from '../../lib/ficha/fecha-relativa';
import { formatearFecha, textoDeOrigen } from '../../lib/ficha/presentacion';
import { mensajes } from '../../lib/mensajes';

/**
 * Origen de un dato de la ficha en texto. Una corrección manual se rotula «Corrección manual · {fecha relativa}» con la
 * fecha absoluta en `<time>` (S5-01); el resto, origen y revisión como siempre.
 */
export function OrigenDelDato({ procedencia, fecha }: { procedencia: Provenance; fecha: string }) {
  if (procedencia.entryMethod !== 'manual_correction') return <>{textoDeOrigen(procedencia)}</>;
  return (
    <>
      {mensajes().ficha.origen.manual_correction} ·{' '}
      <time dateTime={fecha} title={formatearFecha(fecha)}>
        {fechaRelativa(fecha, new Date())}
      </time>
    </>
  );
}
