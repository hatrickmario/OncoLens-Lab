# Design — l1d-187-panel-base-analisis

## Context

Ver `proposal.md`. El panel del S1 (`AnalysisResult`, L1D-140) despacha por clase de resultado
(`clasificarResultado()`) y muestra opciones, descartadas y aviso de IA. La Base llega en `EvidenceAnalysis.analysisBasis`
(contrato congelado). Referencia visual: **S2-09** de `docs/ux/S2/pantallas-s2.md` (un solo diseño; extiende la
tarjeta del panel del S1, sin riesgo de UX nuevo).

## Goals / Non-Goals

**Goals:** resumen siempre visible, detalle colapsable accesible, rama "qué se buscó" en `sin_evidencia`, omitidas
solo como número, nombres de campo del contrato.

**Non-Goals:** contenido de los incisos (b), (c), (g), (h), (i); cálculo de la Base (L1D-186); cambios de contrato.

## Decisions

1. **Textos derivados por funciones puras** (`lib/evidence/resumen-base.ts`): `resumirBase(analysisBasis)` devuelve
   las cifras y listas del resumen; `describirBusqueda(sourcesConsulted)` arma "Qué se buscó…"; `formatearFechaDeCorte()`
   convierte `AAAA-MM-DD` a `dd/mm/aaaa` partiendo la cadena (sin `new Date()`, que desplaza un día según la zona).
   Los componentes solo pintan. Descartada: formatear en el JSX (lógica sin test unitario).
2. **Literal del resumen según el AC** "Fuentes no incluidas: NCCN, ESMO" (decidido en el Gate 1 del S2): sin
   aclaración en el resumen; en el detalle, cada fuente no incluida lleva "sin licencia abierta; su contenido no se
   consultó" (RN-21: se nombra la fuente, nunca su contenido).
3. **Rótulos de `origin`** (S2-09): supuestos `regla_catalogo` → "Regla del catálogo", `llm_verificado` →
   "Redactado por IA y verificado"; limitaciones `estructural` → "Limitación estructural", `llm_verificado` → el mismo
   rótulo de IA. El contrato de `limitations` no tiene `regla_catalogo`: se usa su enum real ("Limitación
   estructural", aceptado en el Gate 1 del S2).
6. **Supuesto declarado en el resumen (Gate 1 del S2).** `resumirBase()` devuelve, además del número, el texto de los
   supuestos `regla_catalogo`; el resumen muestra el supuesto de L1D-186 ("Los faltantes críticos aún no se calculan
   en esta versión") para que "Faltantes: 0" no se lea como "no falta nada".
7. **`tipo_no_habilitado`:** `describirBusqueda()` devuelve "No se consultó el corpus: tipo fuera de alcance" en
   lugar de "Qué se buscó…" (la Base la arma L1D-173 con 0 recuperados).
4. **`reviewStatus` en texto:** `verificado` → "Verificado", `corregido` → "Corregido", `requiere_revision` → "Por
   revisar", `auto_aceptado` → "Sin verificar"; `conflict = true` añade "En conflicto". Los avisos informan, no
   bloquean (RN-26).
5. **Expansión con estado local** (`useState`) en el organismo, que ya vive bajo el `'use client'` de `AnalysisResult`.
   Sin provider ni hook propio (un solo consumidor, YAGNI).

## Componentes y patrones

| Componente | Nivel | Concepto | Notas |
|---|---|---|---|
| `AnalysisBasisPanel` | organismo | Base del análisis (encabezado, control, detalle) | ≤ 100 líneas; si las supera, se extrae `BasisSummary` |
| `BasisSummary` (condicional) | molécula | Línea de resumen + fecha + "Qué se buscó" | Solo si el organismo pasa el límite |
| `AnalysisResult` | organismo (modificado) | monta el panel antes del pie | — |

Sin patrones nuevos (sin custom hook, compound components ni provider): un consumidor y sin *prop drilling*. Todo
queda bajo el `'use client'` existente de `AnalysisResult`; no se añade otro límite cliente.

## Privacidad y ownership

- **Fronteras:** solo datos ya presentes en la respuesta de `/api/evidence-analyses` (BFF → `clinical-api`). Ningún
  dato nuevo cruza fronteras; `rag-orchestrator` no interviene ni toca datos clínicos ni `clinical-minio`.
- `patientDataUsed[].label` no lleva identidad (garantía de L1D-186, RN-10); el panel no añade identidad ni la URL
  cambia.
- **Seguridad web:** sin entrada del usuario nueva (no aplica Zod del cliente); sin variables `NEXT_PUBLIC_` nuevas;
  sin módulos `server-only` nuevos; las etiquetas y textos de la Base se renderizan como texto de React (sin
  `dangerouslySetInnerHTML` ni HTML crudo); sin impacto en la CSP ni en las cabeceras; sin dependencias nuevas.

## Dependencias y colaboradores

- `AnalysisBasisPanel` depende solo del tipo generado `AnalysisBasis` (`packages/api-contracts`) y de `lib/evidence/`
  y `lib/mensajes.ts`. Reglas extraídas: `resumirBase()`, `describirBusqueda()`, `formatearFechaDeCorte()`,
  `textoDeRevision()`.

## Contratos

- **Proveedor:** `clinical-api`; **consumidor:** `web`. **Sin diff** en `apps/clinical-api/openapi.yaml`: se usan
  `patientDataUsed`, `missingCriticalData`, `assumptions`, `sourcesConsulted` (`selected`, `filters`, `retrieved`,
  `aboveThreshold`), `sourcesNotIncluded`, `corpusCutoffDate`, `limitations`, `omittedClaims`. Ejemplos de MSW desde
  `contracts/examples/con-evidencia-s1.json` y `sin-evidencia.json`; para AC-1 y AC-4 se derivan variantes en el test
  (`omittedClaims`, listas vacías) sin editar los ejemplos.

## Risks / Trade-offs

- La línea de resumen a 375 px puede partir en varias líneas → se acepta con separadores "·" y `flex-wrap`; lo
  comprueba `visual-check`.

## Decisiones pendientes del humano y deuda (ronda del Gate 2)

- **Pendiente del humano:** (a) el auditor de lenguaje pregunta si el detalle debe listar los faltantes
  (`missingCriticalData`); hoy solo se cuenta; (b) `tipo_no_habilitado` no llega al panel real: `clasificarResultado()`
  lo clasifica como `no_soportado` y `faseTrasSolicitud()` lo trata como error (fijado por `evidence-reglas.test.ts`);
  el organismo ya lo soporta y se prueba renderizando `AnalysisResult` con `tipo-no-habilitado.json`.
- **Pendiente de otro propietario:** un ejemplo contractual `con-evidencia-base-s2.json` (Base real de US-066 AC-1) en
  `contracts/examples/` para sustituir el overlay del test; está fuera de los paths de este change.
- **Deuda (Design P3-1, 2, 6, 7):** anotada, sin cambio de código en esta ronda.

## Open Questions

- Ninguna. Resueltas en el Gate 1 del S2: literal del resumen y aclaración en el detalle (decisión 2), rótulo
  "Limitación estructural" (decisión 3), supuesto declarado (decisión 6) y `tipo_no_habilitado` (decisión 7).
