import { notFound } from 'next/navigation';
import { EvidencePanel } from '../../../../../components/organisms/evidence-panel';
import { EvidencePanelTemplate } from '../../../../../components/templates/evidence-panel-template';
import { esUuid } from '../../../../../lib/ficha/anclas';
import { mensajes } from '../../../../../lib/mensajes';

export const metadata = { title: mensajes().evidence.titulo };

/** RSC: valida el UUID de la ruta (la sesión la garantiza `proxy.ts`); la ficha del paciente no se consulta en el S1. */
export default async function AnalisisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esUuid(id)) notFound();
  return (
    <EvidencePanelTemplate idPaciente={id}>
      <EvidencePanel patientId={id} />
    </EvidencePanelTemplate>
  );
}
