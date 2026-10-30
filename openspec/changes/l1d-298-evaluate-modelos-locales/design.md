# Design — l1d-298-evaluate-modelos-locales

## Context

`app/evaluation/composicion_suite.py` arma `RAGOrchestratorService` con adaptadores falsos y rechaza `adaptadores.proveedor: local` («se cablea con US-073»). Ya existen los adapters reales de producción (US-231a/b), `juez_fidelidad.py`, `llamadas.py` (registro de llamadas a nube con datos reales, hoy solo del juez), `guardas.py` (`es_proveedor_local()`), `medicion_modelos.py` y `cronometro.py`. El procedimiento está en `openspec/changes/archive/2026-10-22-l1d-235-suite-evaluate/design.md` D21. Decidido `[S4 resp. 6]`, `[S4 resp. 10]`; no se reabre.

## Decisiones

- **Reutilizar, no duplicar:** `proveedor: local` instancia los mismos adapters de `app/infrastructure/` que producción (mismo contenedor de modelos de US-231b D4); la suite solo añade guardas y medición. Los fakes siguen cumpliendo el contrato del adapter real.
- **Fail-closed sin pesos:** una comprobación previa (`chequeo_config.py`) lista los artefactos faltantes (variable de configuración, nunca ruta ni valor) y sale con código ≠ 0; nunca PASS ni cifras inventadas (AC-4).
- **Juez local:** nombre propio `juzgar_afirmacion(afirmacion, fragmentos_citados)` que construye el prompt solo con esos dos insumos (sin respuesta completa ni modelo generador); `parsear_veredicto()` devuelve `no_soportada` + contador `veredictos_invalidos` si el JSON es inválido o la cita no está entre los fragmentos. `EVAL_JUDGE_TEMPERATURE=0` y `EVAL_JUDGE_SEED` en configuración (RN-22).
- **Acuerdo:** funciones puras `porcentaje_de_acuerdo()` y `kappa_de_cohen()` (determinista); `JUEZ_ACUERDO_MINIMO` en configuración. Sin muestra humana (DEC-06, S5) solo se reporta juez↔NLI y juez↔humano queda `sin_medir` (nunca 0).
- **RSS y latencia:** `resource.getrusage` (sin dependencia nueva), reloj inyectado vía `cronometro.py`; p50/p95 por hipótesis y por lote; el límite de memoria del contenedor viene de configuración. Un exceso se **reporta**, no se ajusta el presupuesto.
- **Alternativas:** una propuesta elegida (reutilizar adapters y guardas existentes); descartados un juez de nube (ADR-41, RN-12) y un segundo juez local distinto de G (una sola ruta de juez).

## Dependencias y colaboradores

- Modifica `composicion_suite.py`, `config_suite.py`, `chequeo_config.py`, `guardas.py`, `llamadas.py`, `juez_fidelidad.py`, `armado_reporte.py`/`reporte.py`, `corrida.py`, `medicion_modelos.py`; nuevo `app/evaluation/acuerdo_juez.py` (funciones puras) y config `eval/configs/local.yaml`. Depende de los puertos de LLM, embeddings, reranker y NLI, nunca de clientes concretos en `domain/`.
- Reglas con nombre propio: `es_proveedor_local()` (RN-12), `juzgar_afirmacion()`, `parsear_veredicto()`, `kappa_de_cohen()`, `marcar_fidelidad_no_concluyente()`.
- Arrastres: deduplicar el filtro `extraido_verificado` (adapter SQL vs `CatalogoEnMemoria`); hacer públicos los nombres de `config_suite` importados por `corrida_aplicabilidad.py`; mover el armado del reporte de aplicabilidad.

## Privacidad y ownership

Solo `rag-orchestrator`, solo datos sintéticos (`clase: sintetico`, RN-13/RN-14); no toca datos clínicos ni `clinical-minio`. Ningún request sale de la máquina: la lista de hosts locales (loopback y `host.docker.internal`) está en código y no se amplía por configuración ni por alias de Ollama (`ollama cp x:cloud` sin guarda de nube: se valida el nombre del modelo, hallazgo del S2). El reporte contiene solo agregados y configuración, nunca textos de preguntas, fragmentos ni salidas; las discrepancias del acuerdo se listan por id de afirmación. Sin PII en logs.

## Contratos

Sin cambios en `openapi.yaml` ni en `contracts/`: la suite invoca `RAGOrchestratorService` en proceso. Claves nuevas del reporte de `evaluate` (`eval/results/*.json`, esquema `esquema_suite.py`) son aditivas; `baseline.json` solo gana claves. Verificación del proveedor no aplica.

## Evaluación

Cambia la forma de medir, no el modelo, prompt, umbral, catálogo ni corpus. Métricas OL-06 afectadas, contra TBD-02: fidelidad (M-07.2), precisión de citas, «sin evidencia», salidas prescriptivas = 0, p95 por etapa (M-10.1) y las nuevas (acuerdo juez↔NLI, RSS, latencia del NLI). Ejecución manual por `ai-eval-runner` en el MacBook de referencia (Ollama con `OLLAMA_CONTEXT_LENGTH=8192`, LLM ≤ 21 GB, stack ≤ ~30 GB, sin swap, `ollama ps`); reporte a `reports/eval/`. Metas sin modificar.

## Risks / Trade-offs

- Sin los pesos en la máquina de CI el AC-1/AC-7 no se verifican allí: se verifican por el reporte de la corrida manual y por tests con adapters fingidos del cableado y las guardas.
- RSS/latencia del NLI por encima del límite (ADR47-R7): se reporta al refinamiento.
- Kappa con pocas afirmaciones es inestable: el reporte incluye el tamaño de la muestra.

## Pendientes de definir

- Valor inicial de `JUEZ_ACUERDO_MINIMO` (asumido en la historia; dueño: refinamiento/usuario, afecta AC-6).
- Muestra humana juez↔humano llega con DEC-06 (S5): hasta entonces `sin_medir`.
- Límite de memoria del contenedor para la marca de AC-7: clave a fijar en configuración (¿hereda 4489 MiB de us-231b AC-7?).
