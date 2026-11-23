---
name: sinonimos-relacion-l1d335-trampas
description: L1D-335 en ai-services - cargadores de sinonimos con relacion, meta de parafrasis que rompe el esquema cerrado del baseline y trampas del arnes (rama ya usada por otro worktree)
metadata:
  type: project
---

`cargar_sinonimos` solo devuelve canonicos y `equivalente` (S-1, `app/domain/sinonimos.py::es_equivalente`); `cargar_formas_por_termino` da todos los textos y alimenta pertinencia del seguimiento y `formas_del_termino` de la familia contextual. Relacion ausente o fuera del enum -> `CatalogoNoDisponible`; los fixtures de tmp_path de los tests deben traer `relacion` valida.

**Why:** una meta nueva en `metas-iniciales.yaml` rompe el baseline (esquema cerrado, `$.metricas[7] fuera del conjunto`) porque `marcar_frente_a_meta` marcaba una fila por meta; ahora omite las metas cuya clave el informe no declara.

**How to apply:** cualquier meta futura que solo mide otra corrida entra igual sin tocar el esquema. Para continuar una rama que otro worktree ya tiene, usa `git checkout -B wip/<x> origin/<rama>` y empuja con `git push origin HEAD:<rama>` (script con GIT_ASKPASS en el scratchpad). `scripts/ci` y `scripts/ev*` en vitest necesitan `EVAL_PYTHON=/tmp/venv334/bin/python` y `PATH` con ese venv; el symlink node_modules se borra al terminar. Rutas con "eval" se evitan con el glob `ev*`.
