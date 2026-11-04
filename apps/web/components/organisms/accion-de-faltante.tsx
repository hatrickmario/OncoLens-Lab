import Link from 'next/link';
import type { AccionManual } from '../../lib/evidence/faltantes';
import { mensajes } from '../../lib/mensajes';
import { hrefDeRegistroManual } from '../../lib/registro-manual/enlaces';
import { DialogoAtributoClinico } from './dialogo-atributo-clinico';
import { DialogoTratamientoPrevio } from './dialogo-tratamiento-previo';

const ENLACE = 'text-primary inline-block py-1 font-semibold underline';

/**
 * Única acción manual de un faltante (D3, D-7): biomarcador → formulario de la vista de caso por `?item=`;
 * diagnóstico → el de la ficha (donde vive su diálogo); atributo y tratamiento → su diálogo de US-094. La etiqueta del
 * dato completa el nombre accesible y se oculta a la vista porque la fila ya la muestra. Nunca «Cargar documento».
 */
export function AccionDeFaltante({
  faltante,
  etiqueta,
  pacienteId,
  egresado,
  alGuardar,
}: {
  faltante: AccionManual;
  etiqueta: string;
  pacienteId: string;
  egresado: boolean;
  /** Tras el `201` de un diálogo: releer el checklist y recargar la vista (D5). */
  alGuardar: () => void;
}) {
  const t = mensajes().datosCriticos.acciones;
  const conEtiqueta = (texto: string) => (
    <>
      {texto} <span className="sr-only">{etiqueta}</span>
    </>
  );
  const registro = { pacienteId, egresado, alGuardar };
  switch (faltante.tipo) {
    case 'biomarcador':
      return (
        <Link href={hrefDeRegistroManual(pacienteId, faltante.item, 'caso')} className={ENLACE}>
          {conEtiqueta(t.registrarAMano)}
        </Link>
      );
    case 'diagnostico':
      return (
        <Link href={hrefDeRegistroManual(pacienteId, faltante.item, 'ficha')} className={ENLACE}>
          {conEtiqueta(t.completarDiagnostico)}
        </Link>
      );
    case 'atributo':
      return (
        <DialogoAtributoClinico
          {...registro}
          claveInicial={faltante.item}
          textoDeAccion={conEtiqueta(t.registrarAMano)}
        />
      );
    case 'tratamiento':
      return <DialogoTratamientoPrevio {...registro} textoDeAccion={t.agregarTratamiento} />;
  }
}
