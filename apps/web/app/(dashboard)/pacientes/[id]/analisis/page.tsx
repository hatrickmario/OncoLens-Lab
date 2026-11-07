import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { ConversationPanel } from '../../../../../components/organisms/conversation-panel';
import { EvidencePanelTemplate } from '../../../../../components/templates/evidence-panel-template';
import { esUuid } from '../../../../../lib/ficha/anclas';
import { mensajes } from '../../../../../lib/mensajes';
import { preguntasGuiadasDelPaciente } from '../../../../../lib/server/preguntas-guiadas-del-paciente';

export const metadata = { title: mensajes().evidence.titulo };

/**
 * RSC: valida el UUID de la ruta (la sesión la garantiza `proxy.ts`) y compone en servidor las preguntas guiadas del
 * paciente; al panel solo llega esa lista de textos, nunca el resumen ni su identificación.
 */
export default async function AnalisisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esUuid(id)) notFound();
  const preguntasGuiadas = await preguntasGuiadasDelPaciente((await headers()).get('cookie'), id);
  return (
    <EvidencePanelTemplate idPaciente={id}>
      <ConversationPanel patientId={id} preguntasGuiadas={preguntasGuiadas} />
    </EvidencePanelTemplate>
  );
}
