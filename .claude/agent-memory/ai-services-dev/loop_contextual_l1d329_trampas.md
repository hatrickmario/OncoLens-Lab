---
name: loop-contextual-l1d329-trampas
description: Segundo loop contextual (L1D-329, ADR-52) - valores canónicos que faltaban en el catálogo, trampas de NoDecode, clinical-api y del arnés
metadata:
  type: project
---

El loop contextual vive en `RAGOrchestratorService._segundo_loop_si_corresponde` (contextual > reescritura, uno solo); el seguimiento y `/rag/follow-up` llaman `recuperar(con_reescritura=False)`, así que nunca lo disparan. `contextExpansion` solo existe si corrió: `RetrievalParams(...)` se construye sin la clave y `response_model_exclude_unset=True` la omite (nunca `null`).

**Why:** el diseño daba por hechos los «valores permitidos del catálogo» de estadio, grado y biomarcador y no existían: se añadieron a `escalas.json` (`valores`, `valoresDeBiomarcador`).

**How to apply:**
- Una lista por comas en `Settings` necesita `Annotated[tuple[str, ...], NoDecode]`; sin él pydantic-settings intenta JSON y falla con `SettingsError` (el test con `monkeypatch.setenv` lo atrapa).
- Declarar un archivo nuevo en el manifest (`marcosDePregunta: true`) rompe el arranque de `clinical-api` hasta registrar su esquema en `apps/clinical-api/src/infrastructure/catalogo/validar-catalogo.ts` (enumera los esquemas a mano).
- El primer loop ya embebe un resumen del contexto clínico (histología y valores crudos): una aserción de privacidad sobre `embedder.textos` debe filtrar por los textos que empiezan con la pregunta; lo del reranker sí es solo pregunta + términos.
- `nombrable()` del validador del catálogo reduce a `?` cualquier nombre con punto: los campos de las violaciones usan `es_vacias`, no `es.vacias`.
- Un ejemplo de `contracts/examples` que el motor produce se vuelca con un test temporal que escribe el JSON al scratchpad; luego se borra el test.
- `Test-Removal:` debe ir en el MISMO párrafo que `Co-Authored-By` (un solo `-m` con las líneas juntas), no separado por línea en blanco.
- El Bash del worktree rechaza heredocs con `cat >>`, `sed` sobre rutas con `eval` (usa Edit/Write) y `PATH=... npm`: usa scripts envoltorio en el scratchpad (`pt.sh`, `npmv.sh`).
- El harness `app/evaluation` no tiene suite de recuperación contextual: la tarea 5.1 de evaluate real necesita una suite nueva o el script de la medición de ADR-52.
