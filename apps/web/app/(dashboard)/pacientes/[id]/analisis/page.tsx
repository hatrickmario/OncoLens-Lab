import { notFound } from 'next/navigation';
import { EvidencePanel } from '../../../../../components/organisms/evidence-panel';
import { EvidencePanelTemplate } from '../../../../../components/templates/evidence-panel-template';
import { mensajes } from '../../../../../lib/mensajes';

export const metadata = { title: mensajes().evidence.titulo };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RSC: valida el UUID de la ruta (la sesión la garantiza `proxy.ts`); la ficha del paciente no se consulta en el S1. */
export default async function AnalisisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return (
    <EvidencePanelTemplate idPaciente={id}>
      <EvidencePanel patientId={id} />
    </EvidencePanelTemplate>
  );
}
