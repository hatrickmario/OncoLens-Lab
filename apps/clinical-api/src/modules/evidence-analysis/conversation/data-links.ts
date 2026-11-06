import type { ConversationDataLink } from '../../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { TablaDeHechos } from './case-facts.builder.js';

/** Un dato sin fecha confiable (`null`) va al final y nunca se trata como el día `0`. */
const claveDeDia = (dia: number | null): number => (dia === null ? Number.POSITIVE_INFINITY : dia);

/**
 * Orden de presentación de los enlaces (US-260, AC-02.4): día relativo ascendente, sin fecha al final, y a igual día el
 * orden en que llegaron. Regla pura y determinista: nunca se confía en el orden que devuelve el LLM.
 */
export function ordenarPorDiaRelativo(
  enlaces: readonly ConversationDataLink[],
): ConversationDataLink[] {
  return enlaces
    .map((enlace, posicion) => ({ enlace, posicion }))
    .sort(
      (a, b) =>
        claveDeDia(a.enlace.relativeDay) - claveDeDia(b.enlace.relativeDay) ||
        a.posicion - b.posicion,
    )
    .map(({ enlace }) => enlace);
}

/**
 * `dataLinks` de un turno: cada `factRef` que citan los bloques, sin repetir, resuelto con la tabla de hechos de Backend 1
 * (`resourceId`, `origin`, `recordedDate` del registro). Un `factRef` que la tabla no conoce se descarta: Backend 2 ya
 * validó los suyos y un enlace sin registro no puede mostrarse.
 */
export function resolverDataLinks(
  factRefs: readonly string[],
  tabla: TablaDeHechos,
): ConversationDataLink[] {
  const enlaces = [...new Set(factRefs)].flatMap((factRef) => {
    const hecho = tabla.get(factRef);
    return hecho === undefined
      ? []
      : [
          {
            factRef,
            resourceType: hecho.tabla,
            resourceId: hecho.id,
            origin: hecho.origin,
            relativeDay: hecho.relativeDay,
            recordedDate: hecho.recordedDate,
          },
        ];
  });
  return ordenarPorDiaRelativo(enlaces);
}
