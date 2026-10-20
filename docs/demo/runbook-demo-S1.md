# Runbook del demo del S1 (LLM real, datos sintéticos)

Recorrido local de punta a punta: login → paciente semilla → pregunta clínica → **una opción descrita en la evidencia, citada y validada** (walking skeleton). Todo corre en tu Mac: Compose (clinical-api, rag-orchestrator, Milvus, PostgreSQL, web) + modelos de CPU (BGE-M3, bge-reranker-v2-m3, mDeBERTa) + el LLM de ADR-39 en Ollama (`gemma4:26b-a4b-it-q4_K_M`). **Datos 100 % sintéticos** (RN-13/14). Uso académico/investigación.

## 1. Preparar (una vez)
1. **Docker Desktop**: VM con ≥ 12 GB (Settings → Resources). Equipo con ≥ 32 GB; el stack suma ~29 GB con el LLM (ADR-39: margen de 0,7 GB, cierra apps pesadas).
2. **Ollama** y el modelo: `ollama pull gemma4:26b-a4b-it-q4_K_M` (17 GB).
3. **Pesos ONNX** (fuera del repo, ~7 GB de descarga, ~10 min): con un venv que tenga `apps/rag-orchestrator/requirements-eval.txt`,
   `python scripts/demo/exportar-modelos.py ~/adr39-modelos`. Genera `~/adr39-modelos/` con `model.onnx` + `tokenizer.json` por modelo y `modelos.env` (rutas y SHA-256).

## 2. Levantar y apagar
```bash
scripts/demo/levantar.sh     # ~15 min la primera vez (construye imágenes, migra, siembra, carga el corpus); idempotente
scripts/demo/apagar.sh       # detiene el stack y el Ollama que arrancó el script (--borrar-datos: empezar de cero)
```
`levantar.sh` imprime la URL y los usuarios; **nunca** imprime contraseñas: `cat infra/docker/secrets/seed_doctor_password` (médico `doc1@test.local`) o `seed_admin_password` (`admin@test.local`, no ve datos clínicos). Si Ollama ya corría, debe haberse iniciado con `OLLAMA_CONTEXT_LENGTH=8192 OLLAMA_FLASH_ATTENTION=1`.

## 3. Guion (≈ 8 min)
1. **Login** en `http://127.0.0.1:3000/login` (cookie opaca; solo `web` publica puerto). Entra directo al paciente semilla (a) `/pacientes/0fd028e2-…/analisis`, encabezado «Uso académico/investigación».
2. **Con evidencia** (paciente de mama): *«¿Qué opciones adyuvantes describe la evidencia para cáncer de mama HER2 positivo en estadio IIA?»* → «Opciones descritas en la evidencia» con una opción, su justificación, la cita a NCI (`breast-treatment-pdq`), «Ver fragmento» (texto original recuperado en esa consulta) y el aviso «Generado por IA; requiere validación clínica independiente por el oncólogo tratante». Medido por API: ~13 s, `relevance_score` 0,60 (dato secundario, RN-03).
   Otras que dieron `con_evidencia`: tamoxifeno adyuvante con receptores hormonales positivos (~22 s) y antraciclinas en cáncer de mama temprano (~17 s).
3. **Sin evidencia**: *«¿Qué dice la evidencia sobre el tratamiento de la leucemia mieloide aguda en niños?»* → «sin evidencia» en ~3 s, **sin invocar al LLM** (RN-02, `topRelevanceScore = null`).
4. **Seguridad** (comentado, no clicado): el navegador solo habla con `web`; `rag-orchestrator` solo ve el schema `corpus`; la identidad nunca sale de `clinical-api`.

## 4. Límites honestos (decirlos antes de que pregunten)
- **Una opción por respuesta** y sin aplicabilidad, síntesis, preguntas de seguimiento ni orden por aplicabilidad: son S4–S5. El S1 es el esqueleto «caso → opción citada y validada».
- **Latencia**: 3 s sin evidencia; 13–22 s con evidencia y consultas distintas (el NFR es p95 ≤ 15 s; con una sola consulta repetida G midió 9,9 s). La **primera** consulta tras arrancar suma la carga del modelo (~15–25 s). Se recalibra en el S5.
- **Corpus pequeño**: 10 documentos (NCI y PMC de mama y próstata). Con el paciente de mama, una pregunta de **próstata devolvió «sin evidencia»** (probado por API; hipótesis: el contexto del caso es de mama; no se probó con un paciente de próstata). Quédate en mama con el paciente (a).
- Los recorridos Playwright E2E aún no son ejecutables (L1D-278); este guion se ensaya a mano. La consola del navegador muestra un 404 de `favicon.ico` (cosmético).
- El LLM puede dar justificaciones demasiado literales o, en raros casos, añadir un matiz no respaldado (fidelidad 0,95 en la revisión de ADR-39): la validación de citas y NLI es la red de seguridad, no la fluidez.

## 5. Si algo falla
- `/login` da 500 → falta `WEB_HOME_PATH` (lo fija `levantar.sh`; sin él el web se niega a servir).
- `rag-orchestrator` sale al arrancar nombrando una variable → ejecuta de nuevo `scripts/demo/levantar.sh` (crea la colección de Milvus antes del arranque final).
- Análisis lento o error 5xx → `ollama ps` (¿está G cargado al 100 % GPU?) y `docker logs oncolens-rag-orchestrator-1`.
- Memoria justa → cierra otras apps; `scripts/demo/apagar.sh` libera Docker y Ollama.
