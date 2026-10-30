---
name: integracion-rag-iterativa
description: Cómo iterar tests servicios_reales de rag-orchestrator sin repetir los 10 min del job (up una vez, run N veces) y qué rechaza el Bash del worktree
metadata:
  type: feedback
---

Para iterar `pytest -m servicios_reales` en rag-orchestrator: copiar `scripts/ci/integracion-rag-orchestrator.sh` a un script propio con tres subcomandos (`up`: setup-secrets + copiar árbol + `compose up --wait`; `run <args>`: re-copia `git ls-files --cached` y `compose run --rm --no-deps rag-pruebas python -m pytest -p resumen_por_ac …`; `down`). Dirs fijos bajo el scratchpad, `COMPOSE_PROJECT_NAME` propio y subredes libres (`CLINICAL_NET_SUBNET`, `CORPUS_DB_NET_SUBNET`).

**Why:** el job completo tarda ~10 min y la CI no deja ver el rojo/verde por AC; con `up` una vez cada ejecución son segundos.

**How to apply:** el árbol del contenedor sale de `git ls-files --cached` (hacer `git add` de los archivos nuevos antes de `run`; lo modificado en disco sí entra). `node_modules` debe existir (symlink al checkout principal, bórralo al terminar). El Bash del worktree rechaza heredocs con `cat >`, `bash -c`/subshell compuestos y comandos con `cd` + git computado: usa Write/Edit y `python3 - <<'EOF'` solo para ediciones por reemplazo. Los objetos del migrador en `pg_toast` aparecen al consultar `pg_class` por dueño: excluir `^pg_toast`.
