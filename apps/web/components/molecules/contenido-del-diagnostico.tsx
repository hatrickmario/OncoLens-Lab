import type { Diagnosis } from '../../../../packages/api-contracts/src/types/clinical-api';
import type { AperturaDeRegistroManual } from '../../lib/registro-manual/use-apertura-de-registro-manual';
import { mensajes } from '../../lib/mensajes';
import { FormularioDeDiagnostico } from './formulario-de-diagnostico';

/** Contenido del diálogo: espera las opciones del catálogo; sin ellas no hay con qué llenar las listas. */
export function ContenidoDelDiagnostico({
  apertura,
  pacienteId,
  diagnostico,
  alGuardar,
}: {
  pacienteId: string;
  diagnostico: Diagnosis | null;
  apertura: AperturaDeRegistroManual;
  alGuardar: () => void;
}) {
  const t = mensajes().registroManual.diagnostico;
  const { lectura, deLaUrl } = apertura;
  if (lectura === null) {
    return (
      <p role="status" aria-busy="true" className="m-0">
        {t.cargando}
      </p>
    );
  }
  if (lectura.tipo === 'error') return <p className="m-0">{t.opcionesNoDisponibles}</p>;
  return (
    <FormularioDeDiagnostico
      pacienteId={pacienteId}
      vigente={diagnostico}
      catalogoDeRegistro={lectura.catalogoDeRegistro}
      enfocar={deLaUrl?.entidad === 'Diagnosis' ? deLaUrl.campo : undefined}
      alGuardar={alGuardar}
      alCerrar={apertura.cerrar}
    />
  );
}
