# Registros de gates

Aquí vive el registro de cada gate del MVP. Hoy solo G-Demo (US-142, L1D-248).

| Fichero | Qué es |
|---|---|
| `plantilla-G-Demo.md` | Plantilla del registro; `scripts/verify-g-demo` la rellena. |
| `g-demo-excepciones.json` | Excepciones y capacidades diferidas con su Feature y destino; las entradas con `tipo: "se_mide_en_el_piloto"` forman la sección «Validación clínica». Una entrada sin `feature` o sin `destino` hace fallar la verificación. |
| `G-Demo-<fecha>.md` | Registro firmado en **modo real**, versionado en el PR `docs` del cierre del S5 (lo firma el dueño: usuario, PO). |
| `aceptaciones-del-po/` | Aceptación del dueño (PO) de G-Demo **con excepciones** cuando el script dice «no superado»: documenta la decisión y sus hallazgos, sin cambiar cifras ni metas. No es el registro «superado» del script. |
| `no-superados/` | Registros «no superado» conservados por decisión del humano como evidencia de un intento; no declaran G-Demo. `docs/gates/G-Demo-<fecha>.md` queda reservado al registro superado y firmado (el test de higiene lee solo la raíz de `docs/gates/`). |

Un registro en modo fingido (`LLM_PROVIDER=fake`) es regresión del recorrido: se escribe en `reports/gates/` (ignorado por
Git) y nunca declara G-Demo.

## Cómo se genera

```bash
scripts/verify-g-demo --modo real \
  --e2e-resultado reports/gates/e2e-g-demo.json \
  --reporte-evaluate apps/rag-orchestrator/eval/results/<reporte-s5>.json \
  --p95-baseline-s <p95 del baseline de l1d-119>
```

- `--e2e-resultado`: JSON que adjunta `apps/web/e2e/g-demo.spec.ts`, solo con
  `{"modoLlm": "fingido" | "real", "generadoEn": "<ISO>", "pasos": [{"paso": "<nombre del test.step>", "resultado": "ok" | "fallo"}], "catalogVersion": "..."}`.
  Un paso admite `"ok" | "fallo" | "no_verificable"`; `no_verificable` (p. ej., el orden RN-28 con menos de 2 opciones
  visibles) no cuenta como superado: bloquea en modo real y solo avisa en modo fingido (el aviso queda en el registro).
  Sin PII ni texto generado. Su `modoLlm` debe coincidir con `--modo`: un E2E fingido nunca respalda un registro real.
  `corpusRelease` **no** viene del E2E: el contrato que ve el navegador no lo expone (D5-47); sale de
  `configuracion.corpusRelease` del reporte de `evaluate`.
- `--reporte-evaluate` (repetible): reporte de `evaluate` con una de las configuraciones aceptadas, listadas en
  `scripts/gates/g-demo/metricas.json` (hoy `s5-opciones-local`; la suite `all` y, si se corre aparte, la suite `opciones`).
  Sin reporte, o de otra configuración, el gate no se supera.
- `--p95-baseline-s`: p95 del baseline; en modo fingido se ignora y el p95 se declara «no medida».
- `--conteo-json`, `--banderas-json` y `--commit` los fija el wrapper; pasarlos de nuevo se rechaza.
- Las metas salen de `apps/rag-orchestrator/eval/configs/metas-iniciales.yaml`; las dos invariantes del gate (G-2, G-14) y
  las rutas de cada métrica en el reporte, de `scripts/gates/g-demo/metricas.json`.

## Qué comprueba y qué nunca imprime

El script cuenta pacientes por `data_origin` con el rol de `clinical-api` **dentro** de su contenedor y lee de
`docker compose config` solo `REAL_ANONYMIZED_ENABLED` y `REAL_IDENTIFIED_ENABLED`. Su salida y el registro contienen
conteos agregados, nombres de métrica y de variable, versiones y modelos: nunca filas, correos, identidad, contraseñas ni
cadenas de conexión (RN-14). Este registro pasa por `secret-scan` y `data-scan` en el PR.

**Riesgo aceptado:** las dos banderas se leen de `docker compose config` (el entorno del shell que corre el script), no del
contenedor en ejecución; el conteo por `data_origin` sí es en vivo. Leerlas también del contenedor queda como deuda D5-47.

**Qué se versiona:** solo el registro real «superado» va a `docs/gates/G-Demo-<fecha>.md`, y nunca se sobrescribe uno ya
escrito (puede estar firmado). Un registro real «no superado» y los de modo fingido van a `reports/gates/` (ignorado).
Los valores copiados al registro (commit, versiones, modelos, consultas) pasan por una lista blanca; lo que no encaja
aparece como «No disponible».

El bloqueo de arranque con datos reales sin `preflight` es de US-143 (G-Piloto), no de este gate.
