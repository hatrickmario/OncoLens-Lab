# Registros de gates

Aquí vive el registro de cada gate del MVP. Hoy solo G-Demo (US-142, L1D-248).

| Fichero | Qué es |
|---|---|
| `plantilla-G-Demo.md` | Plantilla del registro; `scripts/verify-g-demo` la rellena. |
| `g-demo-excepciones.json` | Excepciones y capacidades diferidas con su Feature y destino; las entradas con `tipo: "se_mide_en_el_piloto"` forman la sección «Validación clínica». Una entrada sin `feature` o sin `destino` hace fallar la verificación. |
| `G-Demo-<fecha>.md` | Registro firmado en **modo real**, versionado en el PR `docs` del cierre del S5 (lo firma el dueño: usuario, PO). |

Un registro en modo fingido (`LLM_PROVIDER=fake`) es regresión del recorrido: se escribe en `reports/gates/` (ignorado por
Git) y nunca declara G-Demo.

## Cómo se genera

```bash
scripts/verify-g-demo --modo real \
  --e2e-resultado reports/gates/e2e-g-demo.json \
  --reporte-evaluate apps/rag-orchestrator/eval/results/<reporte-s5>.json \
  --p95-e2e-s <p95 del baseline de l1d-119>
```

- `--e2e-resultado`: JSON que adjunta `apps/web/e2e/g-demo.spec.ts`, solo con
  `{"pasos": [{"paso": "<nombre del test.step>", "resultado": "ok" | "fallo"}], "catalogVersion": "...", "corpusRelease": "..."}`.
  Sin PII ni texto generado.
- `--reporte-evaluate` (repetible): reporte de `evaluate` con la configuración `s5*.yaml` (suite `all` y, si se corre aparte,
  suite `opciones`). Sin reporte, o de otra configuración, el gate no se supera.
- Las metas salen de `apps/rag-orchestrator/eval/configs/metas-iniciales.yaml`; las dos invariantes del gate (G-2, G-14) y
  las rutas de cada métrica en el reporte, de `scripts/gates/g-demo/metricas.json`.

## Qué comprueba y qué nunca imprime

El script cuenta pacientes por `data_origin` con el rol de `clinical-api` **dentro** de su contenedor y lee de
`docker compose config` solo `REAL_ANONYMIZED_ENABLED` y `REAL_IDENTIFIED_ENABLED`. Su salida y el registro contienen
conteos agregados, nombres de métrica y de variable, versiones y modelos: nunca filas, correos, identidad, contraseñas ni
cadenas de conexión (RN-14). Este registro pasa por `secret-scan` y `data-scan` en el PR.

El bloqueo de arranque con datos reales sin `preflight` es de US-143 (G-Piloto), no de este gate.
