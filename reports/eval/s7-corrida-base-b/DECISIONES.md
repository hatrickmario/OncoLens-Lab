# Corrida base B del S7 · decisiones de la sesión principal

Contexto: el usuario pidió (2026-11-26) avanzar lo máximo posible, decidiendo con análisis acotado y dejando las alternativas descartadas. B mide `main` 33ae47db (estado O3, catálogo 1.9.0) con modelos locales; todo `no_validada`.

## DB-1 · Calidad y latencia en mediciones separadas (2026-11-24)
- **Decidido:** las familias de calidad corren primero; el p95 se mide aparte, con solo el stack de consulta y el LLM.
- **Descartadas:**
  - Medir todo junto: el swap de la ingesta y de `evaluate` contamina la latencia.
  - Esperar a tener una máquina sin otras cargas para todo: bloquea el sprint.

## DB-2 · Freno de memoria: swap > 25 GB o disco < 50 GB
- **Decidido:** se mantiene el freno; al activarse, se identifica el proceso causante con `top -o mem`.
- **Causas encontradas:**
  - La VM de Docker (19,9 GB) junto al LLM y Python (24-nov).
  - Monitor de Actividad del usuario con 39 GB (25-nov).
- **Descartadas:**
  - Subir el freno: las cifras de latencia y la estabilidad dejan de ser fiables.
  - Cerrar apps del usuario por mi cuenta: no es mío.

## DB-3 · Tanda 1 sin Docker; tanda 2 con Docker
- **Decidido:** separar las familias con corpus en memoria (119 baseline y barridos, 334, 329, 331, 333, 119 8.5) de las que necesitan Milvus y Postgres (326, 246, 299, 113).
- **Descartada:** todo con Docker encendido, que ya superó el freno el 24-nov.

## DB-4 · 119 8.6 (brazo de reescritura, D4-30): no se mide en B
- **Hallazgo:** la reescritura (`QUERY_REWRITE_ENABLED`) solo se cablea en `app/bootstrap.py` (el servicio de producción). `app/evaluation/composicion_suite.py` compone el servicio sin reescritura, y no hay config ni runner con ese brazo.
- **Decidido:** no se mide en B. Queda como deuda (D4-30 sigue abierta) y el valor por defecto sigue en `false`, como en `main`. Lo decide `l1d-335` H-2 en la corrida final si para entonces existe el brazo, o se traslada al S8.
- **Descartadas:**
  - (a) Escribir el brazo ahora: es código nuevo sin Gate 2, y B debe medir `main` sin cambios.
  - (b) Medirlo con el stack completo (e2e con `QUERY_REWRITE_ENABLED=true`): da latencia, pero no recall@10, MRR ni «sin evidencia» por consulta, que es lo que pide la tarea, y además mezcla la latencia del BFF.
  - (c) Activarlo por variable de entorno en `evaluate`: no tiene efecto, porque la suite no lee `Settings` para el segundo loop.

## DB-5 · Valores propuestos de los barridos (S7.11, sin escribir en `Settings`)
- **`RETRIEVAL_TOP_K`:** 20 (recall@10 0,953 frente a 0,906; «sin evidencia» 0,986).
  - **Matiz:** con `RERANKER_MAX_PAIRS=20`, 30 y 50 apenas se distinguen de 20.
- **`RELEVANCE_THRESHOLD`:** se propone mantener 0,30, aunque el barrido elige 0,10 por la regla D1.
  - De 0,20 a 0,50 el resultado es idéntico; 0,10 gana por una pregunta de 69, que está dentro del ruido (protocolo anti-sobreajuste de ADR-45).
  - Bajar el filtro admite chunks menos relevantes.
  - Se presenta 0,10 como la salida del barrido y 0,30 como la recomendación; decide el brazo «umbrales calibrados» de la corrida final.
- **`NLI_ENTAILMENT_THRESHOLD`:** se propone mantener 0,70, aunque el barrido elige 0,50.
  - La fidelidad la mide el mismo NLI, así que bajarlo infla la métrica de forma circular y debilita RN-01.
  - Ningún valor llega a 0,90: el cuello de botella es la generación.
- **Descartada:** adoptar los tres valores del barrido tal cual. Ese es el riesgo de sobreajuste que ADR-45 prohíbe.

## DB-6 · p95 sin reinicio
- **Decidido:** medir el p95 al final de la tanda 2, con solo `oncolens-b` y `ollama serve`, sin `evaluate` ni otras apps pesadas y con el swap anotado al inicio. Se rotula «sin reinicio» y se repite tras reinicio solo si sale > 20 s con swap > 5 GB al inicio.
- **Descartadas:**
  - Reiniciar ahora: borra `/private/tmp` (worktree y venv), así que habría que rehacer el entorno y depender del usuario.
  - Omitir el p95: la CI usa 20 s y el baseline en proceso ya dio 21,08 s, así que hace falta la cifra de punta a punta.

## DB-7 · Docker para la tanda 2
- **Decidido:** al terminar la tanda 1b, la sesión principal enciende Docker Desktop (`open -a Docker`) y levanta solo `oncolens-b`; no toca `poc-inmuebles-*`. Si esos contenedores arrancan solos, se dejan y se vigila el swap.
- **Descartada:** esperar al usuario, porque pidió avanzar lo máximo.

## DB-8 · 119 8.5 (D4-21, A0/A2/A2b con `s4-hibrida.yaml`): bloqueada por la config
- **Hallazgo:** `evaluate` rechaza `eval/configs/s4-hibrida.yaml` en `main` con «ConfigInvalida: falta la clave tolerancia_retroceso». La config se quedó atrás del cargador, que añadió esa clave obligatoria.
- **Decidido:** no se mide en B. Se registra como deuda: hay que añadir `tolerancia_retroceso` a `s4-hibrida.yaml` en un PR propio, con OL-06, y medir A0/A2/A2b en la corrida final o en el S8. D4-21 sigue abierta.
- **Descartadas:**
  - (a) Editar la config en el worktree y medir: B dejaría de medir `main`, y el valor de la tolerancia es en sí una decisión de calibración que no tiene revisión.
  - (b) Inventar un valor por variable de entorno: el cargador lee la clave del YAML, así que la variable no surte efecto y el resultado tampoco sería reproducible.

## DB-9 · 333 expansión apagada: segundo intento válido
- **Decidido:** el primer intento (`ev-l1d-333-apagado.log`) falló al arrancar con «falta la clave contextual.genericas_con_evidencia_minimo». El agente lo repitió (`ev-l1d-333-apagado2.log`, exit 0, 120 consultas) con una **copia** de la config, `scratchpad/contextual-local-apagado.copia-b.yaml`. La copia solo añade `genericas_con_evidencia_minimo: 18`, el mismo valor que `contextual-local.yaml`. Se acepta porque esa clave solo alimenta la columna «cumple» de la tabla de cobertura, sin tocar la recuperación, los umbrales ni las consultas. La huella del informe (`afb1cc9e…`) es la de la copia, y queda anotado.
- **Diferencia con DB-8:** en 333 la clave falta en la variante «apagada» y su valor está fijado sin ambigüedad en su gemela versionada. En 8.5, `tolerancia_retroceso` no tiene valor en ninguna config de esa familia: elegirlo sería decidir la calibración.
- **Deuda:** añadir la clave a `contextual-local-apagado.yaml` en `main`.

## DB-10 · p95 de punta a punta de 25,87 s: provisional
- **Hallazgo:** el desglose por etapas, reconstruido con las marcas de tiempo del log del orquestador, da:
  - LLM, ~12,9 s (nativo; igual o menos que en proceso);
  - reranker, ~6,3 s (2,9 s en proceso);
  - NLI, ~7,1 s (0,7 s en proceso).

  El exceso está en los modelos ONNX dentro del contenedor (VM de Docker con 8 CPU compartidas, `MODEL_INTRA_OP_THREADS=8`) y en el swap de 20,7 GB al inicio, no en el LLM.
- **Decidido:**
  - La cifra queda como **provisional** y se repite tras un reinicio, como manda DB-6.
  - Hacerlo en la misma sesión de medición que F evita reiniciar dos veces y ofrece la misma máquina para comparar.
  - La configuración de CPU e hilos del contenedor queda como deuda, con medición propia.
- **Descartadas:**
  - (a) Darla por válida: contradice DB-6, y el swap y la contención de CPU la contaminan.
  - (b) Cambiar ahora los hilos o la CPU de la VM y volver a medir: B tiene que medir `main` sin cambios, y ese ajuste es una decisión de configuración que necesita su propia medición.
  - (c) Reiniciar ahora: borra el worktree y el venv de `/private/tmp`, requiere al usuario y no cambia la contención de CPU del contenedor.

## DB-11 · Regla temporal de `pg_hba` en el stack local `oncolens-b`
- **Hecho:** para correr 326 desde el host, el agente añadió una regla de `pg_hba` solo para `rag_corpus` desde 10.91.30.1/32, en el stack local con datos sintéticos.
  - Reinició Postgres y **la revirtió** al terminar: el archivo quedó restaurado y la marca `TANDA2-B` tiene 0 coincidencias.
  - El reinicio coincidió con la primera consulta del p95, que es el `errores: 1` (`OperationalError` en `catalogo`).
- **Decidido:** se acepta porque no toca código, `main` ni el repo, se limitó a un rol y una IP y se revirtió.
- **Descartada:** correr 326 dentro del contenedor, que obliga a montar el runner y sus dependencias de evaluación en la imagen de producción.
- **Para F:** correr 326 antes del p95, o esperar a que Postgres esté sano, para que el reinicio no cuente como error.

## DB-12 · B se da por hecha
- **Decidido:** B queda **hecha** para la calidad y como referencia de F.
  - El p95 de punta a punta queda provisional (DB-10).
  - 119 8.5 y 8.6 quedan como deuda (DB-4 y DB-8).
  - El orquestador puede seguir con O5.
- **Descartadas:**
  - Esperar a repetir el p95 tras reiniciar: bloquea O5 por una cifra que F vuelve a medir de todos modos.
  - Arreglar las configs de 8.5 y repetir B: cambiaría la base que se mide.
- **Nota:** #436 (L1D-335) se mergeó antes de este cierre. No afecta a B, que mide 33ae47db.
