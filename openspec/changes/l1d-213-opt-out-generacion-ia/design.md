# Design — l1d-213-opt-out-generacion-ia

## Context

`clinical.patient_opt_out` (índice `(patient_id, opt_out_type, recorded_at DESC)`) y el seed del paciente (d) con una
marca `analisis_ia registrado` existen desde el Pre-S1/S1; el contrato ya promete `403 OPT_OUT_ANALISIS_IA`
(`PermisoDenegadoOOptOut`) en el análisis y el seguimiento. Ningún servicio lo consulta (DEC-22). El S6 añade el chat
(l1d-315: `POST /platform/conversations/{conversationId}/turns`, marcado `generaIA`). `agreement_reference` `NULL` en un
paciente real significa «sin convenio» y no se presume consentimiento (`data-model.md`, deuda de L1D-168).

**Goals:** un guardia único, declarativo y verificable por la CI sobre toda ruta que genera con IA; la ficha expone si
la IA está disponible sin revelar la marca; la UI lo comunica sin bloquear lo demás.

**Non-Goals:** registrar o revocar marcas (US-149), auditar denegaciones (US-150), resumen del caso, re-ejecución y
búsqueda complementaria (no existen), retirar `…/follow-ups`.

## Decisions

### D1 · Módulo `opt-outs` con un servicio y un middleware
`OptOutService.consentimientoIA(patientId): 'disponible' | 'opt_out' | 'sin_convenio'` lee la última marca
`analisis_ia` y el paciente (`data_origin`, `agreement_reference`). Reglas puras con nombre propio:
`ultimaMarcaVigente(marcas)` (la más reciente por `recorded_at`; `revocado` → sin opt-out) y
`consentimientoPresumible(paciente)` (`real_anonimizado`/`real_identificado` con `agreement_reference NULL` → no).
`optOutGuard(resolverPaciente)` es la factoría del middleware: `resolverPaciente(req)` devuelve el `patientId` (del
cuerpo en el análisis, del análisis en el seguimiento, de la conversación en el turno) o `null` → `next()` para que el
handler responda su `400`/`404`. Una sola regla: la ficha usa el mismo servicio (`aiAnalysisAvailable =
consentimientoIA === 'disponible'`).

### D2 · Orden en la cadena de Express
sesión → `authorize(permiso)` → `optOutGuard` → handler. El `admin` recibe `PERMISO_DENEGADO` antes de que se lea la
marca (mínimo privilegio). El guardia corre antes de cualquier llamada a `rag-orchestrator`, de crear el
`AIAnalysisRecord` o el turno, y de cualquier limitador de solicitudes que se añada después.

### D3 · Marca `generaIA` declarativa y lista cerrada
Propuesta: extensión `x-genera-ia: true` en las operaciones del spec + constante `RUTAS_GENERA_IA` (lista cerrada,
fuente de DEC-22) en `opt-outs/rutas-genera-ia.ts` + registro `registrarRutaGeneraIA(router, metodo, path,
resolverPaciente, ...handlers)` que monta siempre el guardia. El test de cobertura (Vitest) compara tres conjuntos: las
operaciones con `x-genera-ia`, `RUTAS_GENERA_IA` y las rutas Express que llevan `optOutGuard` (inspección del stack del
router); cualquier diferencia falla. Descartadas en una línea: solo un decorador en el código (no ata al contrato); una
lista en configuración (la lista es legal, no calibrable, RN-22 no aplica).

### D4 · Análisis en curso (AC-6)
La marca se lee una vez, al entrar la petición. Un análisis que ya pasó el guardia termina y persiste aunque la marca
se registre durante la llamada a Backend 2; el siguiente responde `403`. No se relee la marca antes de persistir.

### D5 · Respuesta de error
`403` con `ErrorPermisoOOptOut` `{ error: "OPT_OUT_ANALISIS_IA", traceId }`, sin `externalReference`, `reasonCode` ni
tipo de causa (opt-out o sin convenio) en el cuerpo ni en los *logs* (RN-10). El *log* registra solo `traceId`, UUID del
paciente, `operationId` y `motivo = opt_out | sin_convenio`.

### D6 · UI
`ficha-del-doctor.tsx` recibe `aiAnalysisAvailable`; con `false` muestra el aviso «El análisis con IA no está disponible
para este paciente» (texto en `lib/textos`), pasa `disabled` al panel conversacional (campo de pregunta y envío; el formulario «Analizar evidencia» lo retira L1D-324)
(l1d-324). Dependencia: se espera que el panel de l1d-324 exponga la prop `disabled` (campo de pregunta y envío
deshabilitados); este change no edita l1d-324. No se muestran referencia ni motivo. La vista de caso no cambia.

## Contratos

Proveedor: `clinical-api`; consumidores: `web` (cliente generado) y los tests de verificación del proveedor (US-214).
Cambio **aditivo** (oasdiff sin incompatibles), compatible con ADR-26; versión: siguiente menor libre tras la de
l1d-315/l1d-320/l1d-322: **1.27.0** (glosario del chat §1). `createConversationTurn` ya trae `x-genera-ia: true` y
`403 PermisoDenegadoOOptOut` desde l1d-315 (1.24.0); este change no toca esa operación del contrato.

```diff
   /platform/evidence-analyses:
     post:
       operationId: createEvidenceAnalysis
+      x-genera-ia: true
   /platform/evidence-analyses/{analysisId}/follow-ups:
     post:
       operationId: createFollowUp
+      x-genera-ia: true
   # /platform/conversations/{conversationId}/turns (createConversationTurn): sin cambios, ya declarado por l1d-315
   PatientSummary:
     required:
+      - aiAnalysisAvailable
     properties:
+      aiAnalysisAvailable:
+        type: boolean
+        description: >-
+          false si el paciente tiene opt-out vigente de analisis_ia o es real sin convenio (RN-15).
+          No expone la referencia, el motivo ni la causa.
```

Ejemplos: `contracts/examples/patient-summary-*.json` con `aiAnalysisAvailable`; nuevo
`patient-summary-opt-out.json` (`false`); `error-opt-out.json` sin cambios. Zod y el cliente TS se regeneran
(`contracts:generate`), nunca se editan a mano. Backend 2 no cambia.

## Privacidad y ownership

- Nada cruza hacia `rag-orchestrator` cuando el guardia deniega: cero llamadas a `/rag/query`, `/rag/follow-up` y
  `/chat/turn` (test con cliente que cuenta invocaciones). `rag-orchestrator` no toca datos clínicos ni
  `clinical-minio`; este change no lo modifica.
- La marca (referencia externa, motivo) nunca sale de `clinical-api`: ni a `web`, ni a la respuesta de error, ni a los
  *logs* (RN-10). `web` solo recibe un booleano.
- Desidentificación (RN-11) sin cambios: el guardia actúa antes de construir el contexto.
- Datos: solo sintéticos en S6 (RN-13); el paciente real sin convenio del AC-9 se crea en la BD de test con
  `data_origin = real_anonimizado` sintético, sin datos reales.
- **Seguridad web:** sin variables `NEXT_PUBLIC_` nuevas; `aiAnalysisAvailable` llega por el schema Zod generado; el aviso
  es texto estático (sin HTML crudo); sin impacto en CSP ni cabeceras; sin dependencias nuevas.

## Componentes y patrones

Sin componentes nuevos: `ficha-del-doctor.tsx` gana una rama de aviso (reutiliza el átomo de aviso existente) y una prop
`disabled` hacia el panel conversacional. Sin hooks ni providers nuevos (YAGNI). Pantalla de referencia:
`docs/ux/S6/variante-b.html` (estado deshabilitado del campo) y el sistema de diseño de `docs/ux/`.

## Dependencias y colaboradores

- Nuevo `src/modules/opt-outs/`: `opt-outs.repository.ts` (Prisma, última marca y datos de consentimiento del
  paciente), `opt-outs.reglas.ts` (`ultimaMarcaVigente`, `consentimientoPresumible`), `opt-outs.service.ts` (factoría
  que recibe el repository), `opt-out.guard.ts` (`optOutGuard`), `rutas-genera-ia.ts` (`RUTAS_GENERA_IA`,
  `registrarRutaGeneraIA`).
- Modificados: `evidence-analysis.controller.ts`, `follow-up.controller.ts`, el controller de turnos de l1d-315 (usan
  `registrarRutaGeneraIA`), `patients/ficha.service.ts` (consume `OptOutService` por parámetro), `composition.ts`.
- Fakes: el cliente de `rag-orchestrator` que cuenta invocaciones es un handler MSW desde `contracts/examples/`; no hay
  fakes de puertos nuevos. Ninguna regla se duplica: el literal `OPT_OUT_ANALISIS_IA` viene del Zod generado.

## Risks / Trade-offs

- Rutas de generación futuras sin marcar → mitigado por el test de cobertura de tres conjuntos.
- Una consulta extra por petición de generación → índice existente; despreciable frente al LLM.
- La ruta de turnos y su `403` en el contrato los trae l1d-315; aquí solo se monta el guardia en su ruta Express y entra
  en `RUTAS_GENERA_IA` (dependencia ↪).
- [l1d-324 sin prop `disabled`] → la tarea 3.2 queda bloqueada hasta que l1d-324 la exponga; no se edita su change.

## Migration Plan

Sin migración de esquema. Despliegue aditivo; rollback = revertir el PR.
