import type {
  ChatBlock,
  ConversationDataLink,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { esUuid, hrefDeFicha, hrefDeVistaDeCaso } from '../ficha/anclas';
import { mensajes } from '../mensajes';

export interface EnlaceDeDato {
  clave: string;
  etiqueta: string;
  href: string;
}

function rutaDelDato(patientId: string, tipo: ConversationDataLink['resourceType']): string {
  if (tipo === 'diagnosis') return hrefDeFicha(patientId, 'diagnostico');
  if (tipo === 'biomarker') return hrefDeFicha(patientId, 'biomarcadores');
  return hrefDeVistaDeCaso(patientId);
}

/**
 * Resuelve los `factRefs` de un bloque contra `turn.dataLinks[]` (glosario §3). Un `factRef` sin enlace no se pinta y
 * uno repetido se pinta una vez. La ruta se deriva en la UI (no hay `historyPath`) y solo lleva el UUID del paciente.
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
  return [...new Map(resueltos.map((e) => [e.factRef, e])).values()].map((e) => ({
    clave: e.factRef,
    etiqueta: e.recordedDate ? `${datos[e.resourceType]} · ${e.recordedDate}` : datos[e.resourceType],
    href: rutaDelDato(patientId, e.resourceType),
  }));
}
