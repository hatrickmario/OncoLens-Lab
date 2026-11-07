---
name: chat-relevancia-l1d321-trampas
description: Cómo quedó la subintención relevancia del nodo faltantes (L1D-321) y trampas del arnés, enrutado y catálogo
metadata:
  type: project
---

`NodoRelevancia` (`app/application/chat/capacidades/relevancia_del_dato.py`) se inyecta en `crear_nodo_faltantes(datos, relevancia)`; solo corre si `es_pregunta_de_relevancia()` (enrutado.py, patrón `_RELEVANCIA` ordenado después de fuentes/evidencia y antes de caso). Sin corpus detrás (`relevancia=None`) `faltantes` verbaliza como antes. No hay `subintent` nuevo en el contrato (el enum solo admite `seguimiento_evidencia`).

**Why:** el contrato no sube versión (glosario S6 §1); el aviso «sin evidencia» va en `notices[]` (no como bloque) para cumplir «solo catálogo + aviso».
**How to apply:**
- `normalizar_texto` convierte guiones en espacios («Ki-67» → «ki 67»); los sinónimos del catálogo salen ya normalizados.
- `criterios_que_usan` es cobertura de `destination`, no igualdad (igualdad estricta daba «sin criterio» para RE/HER2/ECOG).
- La consulta al corpus lleva un `ClinicalContext` vaciado (el resumen también se embebe); el arnés comprueba `embedder.textos == [consulta, "mama"]`.
- Los ejemplos con `ultimaEvidencia.chunkIds` dependen de `parametros_de_reescritura()` (TOP_K=1): al regenerar, comparar contra el motor.
- El Bash del worktree rechaza `cat >>` con heredoc y `cd` + git con rutas calculadas; `python3 - <<'E'` sí corre. Venv en el scratchpad de la sesión; `npm run quality` no corre local (falta `@vitest/eslint-plugin`): usar `lint-imports` y `ruff format --check`.
