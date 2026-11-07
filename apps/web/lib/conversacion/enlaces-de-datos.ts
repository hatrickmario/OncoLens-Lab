import type {
  ChatBlock,
  ConversationDataLink,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { esUuid } from '../ficha/anclas';
import { mensajes } from '../mensajes';

export interface EnlaceDeDato {
  clave: string;
  etiqueta: string;
  enlace: ConversationDataLink;
}

/**
 * Resuelve los `factRefs` de un bloque contra `turn.dataLinks[]` (glosario §3). Un `factRef` sin enlace no se pinta y
 * uno repetido se pinta una vez. El dato se abre en el panel lateral: la ruta del histórico la deriva
 * `rutaDeHistorico` (no hay `historyPath`) y ninguna ruta lleva más que ids opacos.
 */
export function enlacesDelBloque(
  bloque: Pick<ChatBlock, 'factRefs'>,
  dataLinks: readonly ConversationDataLink[],
  patientId: string,
): EnlaceDeDato[] {
  if (!esUuid(patientId)) return [];
  const { datos } = mensajes().conversacion;
  const resueltos = (bloque.factRefs ?? []).flatMap((ref) => {
    const enlace = dataLinks.find((candidato) => candidato.factRef === ref);
    return enlace ? [enlace] : [];
  });
  return [...new Map(resueltos.map((e) => [e.factRef, e])).values()].map((enlace) => ({
    clave: enlace.factRef,
    etiqueta: enlace.recordedDate
      ? `${datos[enlace.resourceType]} · ${enlace.recordedDate}`
      : datos[enlace.resourceType],
    enlace,
  }));
}
