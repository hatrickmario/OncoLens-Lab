# Design — l1d-332-aviso-ampliacion-visible

## Context

`ConversationNotices` pinta `turn.notices[]` al final de la tarjeta, tras `AccionesDelTurno`. La rama `evidenceAnalysis`
de `ConversationTurnBody` delega en `AnalysisResult` (encabezado «Opciones descritas en la evidencia», criterio de orden
y tarjetas de opción) e ignora `turn.blocks[]`, por lo que los bloques `limitacion` de un turno sin opciones soportadas
no se ven. Referencia: `docs/ux/sistema-de-diseno.md` (aviso no bloqueante: `warn-*`); sin desviaciones.

## Decisions

1. **Los avisos suben junto al encabezado solo en turnos con `evidenceAnalysis`.** `AnalysisResult` recibe una prop
   opcional `avisos?: ReactNode` y la coloca justo bajo `<h2>` (clase `con_opciones`) o bajo el primer aviso del análisis
   (resto de clases); la tarjeta no los repite al final. No se identifica el aviso de ampliación por su texto ni se lee
   `contextExpansion`: se pintan todos los `notices[]` tal cual, de modo que RN-19 sigue saliendo solo del turno y un
   turno sin ampliación no deja hueco (AC-4). Descartada: reordenar solo el aviso de ampliación (exige que `web`
   reconozca el texto de Backend 2). Revertir es barato (UI): sin exploración de alternativas.
2. **Los bloques `limitacion` se pintan tras `AnalysisResult`** con `ConversationBlock` (rótulo «Alcance de la
   respuesta», sin `<details>`), solo en la rama `evidenceAnalysis`; los demás kinds de `blocks[]` siguen sin pintarse
   ahí (las opciones ya salen de `AnalysisResult`: sin duplicados).
3. Sin patrones nuevos (props y composición), sin dependencias.

## Privacidad y ownership

Sin datos nuevos ni peticiones nuevas: solo reordena campos del turno ya recibido por `/api/*`. Textos como texto React
(Markdown seguro de `ConversationBlock`). `rag-orchestrator` no se toca.
