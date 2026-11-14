# Design — l1d-314-spike-assistant-ui

## Context

- ADR-51 §8 deja la UI del chat abierta entre assistant-ui y shadcn a mano; el criterio de salida son
  los cinco escenarios del usuario `[S6 resp. 2]`.
- `apps/web` usa Next.js 16.4.2, React 19.3.1, Tailwind v4 y shadcn/ui (Atomic Design: `components/atoms`,
  `molecules`, `organisms`, `templates`). El panel de análisis existente (opciones, citas, aplicabilidad,
  avisos RN-19) es la alternativa shadcn.
- `apps/web/proxy.ts` no emite todavía `Content-Security-Policy`: llega con US-216 (L1D-266) en el S6.
- `contracts/examples/chat-turn-*.json` todavía no existe: lo crean `l1d-315-conversacion-paciente` y
  `l1d-316-chat-turn-langgraph`.
- Referencia visual: `docs/ux/S6/variante-b.html` «Hilo con tarjetas» `[S6 resp. 16]`, con los hallazgos
  de lenguaje y accesibilidad ya aplicados (`docs/ux/S6/pantallas-s6.md` §7).
- `@assistant-ui/react` 0.15.32 (MIT, 2026-10-28, ~267 KB gzip según `S6-refinamiento.md`): `ExternalStoreRuntime`
  y `LocalRuntime` documentados como estables.

## Goals / Non-Goals

**Goals:**
- Decidir con evidencia (Playwright + `visual-check`) si assistant-ui cumple AC-1…AC-4 de US-257 y
  anotar la decisión en ADR-51 §8 con el peso gzip medido (AC-7).
- Dejar en el reporte lo que US-267 necesita: APIs usadas y su estado, primitivas reutilizables,
  configuración de Markdown y CSP.

**Non-Goals:**
- Código mergeable, tests permanentes, backend real, `@assistant-ui/react-langgraph`/`langgraph-api`.

## Decisions

1. **Timebox de 3 puntos y salida por defecto shadcn.** Si el timebox se agota sin AC-1…AC-4 en
   `cumple`, la decisión es «shadcn sobre los componentes del panel» (Contexto técnico de US-257).
   Revertir es barato (el código no se mergea), así que no se exploran tres alternativas.
2. **Runtime: `ExternalStoreRuntime`** primero (el estado de los mensajes lo sigue teniendo `web`, como
   hará US-267 con el BFF); `LocalRuntime` solo si el primero exige APIs no estables. Nada con prefijo
   `unstable_`, ni marcado `experimental`/`beta` en la documentación 0.15.x (AC-3).
3. **Transporte fingido en el mismo origen.** Un Route Handler de la rama del spike (`app/api/spike-chat/route.ts`)
   sirve las respuestas fijas de `contracts/examples/chat-turn-*.json` (o una copia local con la forma de
   los `design.md` de l1d-315/l1d-316 si aún no están en `main`; se anota en el reporte). El navegador
   solo habla con `web` (AC-5).
4. **Markdown sin HTML crudo (glosario §3, regla de L1D-266 D6):** el renderizador de texto de assistant-ui
   (o `react-markdown` en la salida shadcn) configurado **sin `rehype-raw`**, **con `rehype-sanitize`** y con
   `urlTransform` que devuelve `''` si `esUrlHttpSegura()` es falso (función de L1D-266 en
   `apps/web/lib/evidence/procedencia.ts`, reutilizada, no copiada); prueba con un bloque Markdown que contiene
   `<img src=x onerror=alert(1)>` y `[x](javascript:alert(1))` (AC-4): el DOM no tiene `img` nuevo, ningún `href`
   con esquema no seguro y el manejador no se ejecuta.
5. **CSP:** la cabecera objetivo de US-216 (`script-src 'self' 'nonce-…'`, sin `unsafe-eval` ni
   `unsafe-inline`); si US-216 no está mergeado, se aplica en `proxy.ts` de la rama del spike. Playwright
   registra `securitypolicyviolation` con un listener inyectado y exige cero (AC-2).
6. **Peso gzip:** medido con `next build` de la rama (diferencia del First Load JS de la ruta del
   prototipo frente a la misma ruta sin assistant-ui), no copiado de la documentación (AC-7).
7. **Criterio de cada escenario** `[S6 resp. 2]`: (1) resumen del caso con enlaces a los datos que lo
   sustentan; (2) indicador por faltante con estado de verificación y explicación desplegable;
   (3) pregunta de seguimiento sobre el análisis; (4) síntesis, aplicabilidad, «Opciones descritas en la
   evidencia», citas y limitaciones; (5) abrir fuente, expandir y consultar referencias sin perder el
   hilo (scroll y foco conservados). En 1–4, avisos RN-19 en cada turno del asistente (AC-6).

## Privacidad y ownership

- Sin datos clínicos reales ni backend: solo respuestas fijas del contrato y el paciente semilla (a),
  sintético. Nada cruza a `clinical-api` ni a `rag-orchestrator`; `rag-orchestrator` no se toca.
- La identidad no aparece en las respuestas fijas (las del contrato ya llegan desidentificadas, RN-11);
  red verificada: solo `/api/*` del mismo origen, sin PII en URLs.
- **Seguridad web:** sin variables `NEXT_PUBLIC_` nuevas; texto del LLM y del corpus renderizado como
  Markdown sin `rehype-raw`, con `rehype-sanitize` y `urlTransform` vía `esUrlHttpSegura()` (Decisión 4); CSP estricta sin `unsafe-eval` (Decisión 5); dependencia nueva
  `@assistant-ui/react` 0.15.32 **solo en la rama del spike**, con `npm audit` registrado en el reporte;
  si gana, su adopción en `main` (y su auditoría) es de US-267.

## Contratos

Sin cambios. Consumidor de lectura de `contracts/examples/chat-turn-*.json` (proveedor: `clinical-api`,
definido por l1d-315/l1d-316). Ningún diff de `openapi.yaml`.

## Componentes y patrones

Solo en la rama del spike, desechables: un `organism` de hilo con `AssistantRuntimeProvider` montado en
un único `'use client'` de la página del prototipo; tarjetas de turno que reutilizan los componentes
existentes del panel (citas, aplicabilidad, avisos) dentro de las primitivas de assistant-ui. No se
introduce ningún patrón en `main`; la propuesta de componentes para US-267 va en el reporte.

## Dependencias y colaboradores

- Rama del spike: `apps/web/app/(spike)/…`, `app/api/spike-chat/route.ts`, `e2e/spike-assistant-ui.spec.ts`.
- `main`: `docs/evidence/S6-spike-assistant-ui/README.md` (+ capturas) y
  `docs/architecture/adr/ADR-51-chat-langgraph-estado-efimero.md` §8.
- Sin reglas de dominio nuevas; los avisos RN-19 y el encabezado RN-23 se leen de donde ya viven en `web`.

## Risks / Trade-offs

- [assistant-ui inyecta estilos o scripts inline] → falla AC-2 y la salida es shadcn.
- [El contrato del turno cambia tras el spike] → el reporte registra la versión de los ejemplos usada;
  US-267 valida contra el contrato final.
- [0.x con cambios frecuentes] → se fija 0.15.32 y el reporte lista las APIs; US-267 revalida.
- [Timebox insuficiente] → salida shadcn por defecto (Decisión 1).
