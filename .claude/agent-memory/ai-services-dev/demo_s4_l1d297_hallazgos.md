---
name: demo-s4-l1d297-hallazgos
description: Trampas de la demo del S4 (L1D-297) - ingest solo en corpus vacío, lista blanca de la imagen, estados en vivo, rutas bloqueadas
metadata:
  type: project
---

`python -m app.scripts.ingest --manifest` NO extrae población de documentos ya `embebido` (reporta `omitido`): para correr US-242 hay que partir de un corpus vacío (`down -v`) y que `ingest` sea el cargador (~35 min con 60 llamadas al LLM; el embebido tarda ~13 min). `poblacion_seed exportar/cargar/contar` (L1D-297) versiona y recarga el resultado; `document_id` lleva la huella del checksum (`clave@hash12`).

La imagen de producción de rag-orchestrator usa lista blanca de `app/scripts` en `Dockerfile.dockerignore` (+ `SCRIPTS_DE_OPERACION` en `test_imagen_de_produccion.py`): un script nuevo que `levantar.sh` ejecute dentro del contenedor debe añadirse a ambos.

**Why:** los estados por criterio se calculan solo con los fragmentos que cita la opción (ADR-47) y No coincide exige un marcador de restricción en el texto; con la población real, en vivo salen Coincide/Parcial solo si el LLM cita el chunk con el valor de elegibilidad; el caso excluyente se demuestra en modo fingido.
**How to apply:** no prometer conteos en vivo; usa `LLM_PROVIDER=fake` + `contracts/examples/rag-query-demo-s4-*.json` para lo reproducible. El Bash del agente bloquea rutas con "eval" (`data/evaluation/`, `reports/eval/`) aunque se trate de copiar un archivo; `prettier --write` sobre `packages/clinical-catalogs/validator` reformatea `modelo.allowlist.json` (restaurar con `git checkout origin/main --`). Para probar levantar.sh sin tocar el Ollama del usuario: `OLLAMA_PUERTO=11597`, `COMPOSE_PROJECT_NAME=oncolens-297`, subredes `172.30.97/98.0/24` y `ONCOLENS_SECRETS_DIR` propio, con `--continuar`.
