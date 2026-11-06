---
name: chat-caso-l1d317-trampas
description: Cómo quedó el nodo caso del chat (L1D-317): inyección, NLI, aviso extra y trampas del arnés
metadata:
  type: project
---

El nodo `caso` vive en `app/application/chat/capacidades/caso.py` y se inyecta con `construir_grafo(capacidades={Intencion.caso: NodoCaso(...).ejecutar})`; descarta afirmaciones y las cuenta en `omitidas_del_nodo` (estado del grafo, se vacía en `ENTRADAS_DEL_TURNO_VACIAS`). El NLI sale de `VerificadorDeSoporte.pares_soportados`; sin NLI (`soporte=None`, p. ej. sin modelos cargados) falla cerrado con `LOCAL_LLM_UNAVAILABLE` DESPUÉS de llamar al LLM (un test de composición espera 1 llamada).

**Why:** el contrato de `/chat/turn` solo admite 503 de LLM local o salida inválida, no `NLI_UNAVAILABLE`.
**How to apply:** nodos futuros (318, 322) siguen el mismo patrón; el aviso «Verifique contra las fuentes» (`chat_notice_verify`) ya va en todo turno con contenido generado, no solo en caso.

Trampas del entorno: la pregunta sobre PSA con contexto de mama cae en `fuera_de_alcance` (usar `cancerType=prostata` en el test); el worktree rechaza heredocs con `cat >>`, usar Write/Edit o `python3 -I -` con heredoc; el `node_modules` compartido no trae `@vitest/eslint-plugin` (eslint no corre local).
