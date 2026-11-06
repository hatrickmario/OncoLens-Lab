# Proposal — l1d-266-cabeceras-seguridad-web

## Trazabilidad

L1D-266 · US-216 · FEAT-PL1 (L1D-30) · Sprint 6 (desde S1, `[Pre-S1 resp. 9]`; `[S6 resp. 8]`: todas tal cual) ·
Estimación **3** · técnica (PRD §17) · RN-14, RN-01, RN-04, RN-22, NFR-11, SEG-01 (CSRF ya cubierto), SEG-12, PRD §11 #12 ·
US-216 AC-1…AC-5 · Excepción nombrada (usuario, 2026-10-20): `/login` (L1D-197) se mergeó sin CSP ni anti-clickjacking;
este change las aplica a toda la app, `/login` incluida, antes de G-Piloto · Fuente:
`backlog/features/FEAT-PL1-plataforma-base.md` §US-216 · ADR-51 §8 (CSP sin `unsafe-eval`, Markdown sin HTML crudo).

## Why

Hoy `apps/web/next.config.ts` no declara cabeceras y `apps/web/proxy.ts` solo pone `Cache-Control: no-store` en
`/pacientes/*`: ninguna respuesta lleva `Content-Security-Policy`, `frame-ancestors` ni `X-Frame-Options`, y `/login`
puede cargarse en un `<iframe>` ajeno. El S6 añade el panel conversacional (`l1d-324`, `l1d-325`) y posiblemente
assistant-ui (`l1d-314`), que muestran texto del LLM y del corpus: sin una CSP estricta, una fuente maliciosa o un error
de render podría ejecutar script en la sesión del oncólogo. Además falta la lista permitida de variables `NEXT_PUBLIC_*`
y el escaneo de secretos del bundle que exige RN-14.

## What Changes

- **CSP con nonce por request** en `proxy.ts` (Next.js 16 renombra `middleware.ts` a `proxy.ts`) para toda página y
  Route Handler: `default-src 'self'`, `script-src 'self' 'nonce-…' 'strict-dynamic'` sin `unsafe-inline` ni
  `unsafe-eval`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `frame-ancestors 'none'` (AC-1). El
  *matcher* se amplía a toda la app; el `no-store` y la redirección sin sesión siguen solo en `/pacientes/*`.
- **Cabeceras estáticas** en `next.config.ts` (`headers()`): `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy` sin cámara, micrófono ni geolocalización y
  `X-Frame-Options: DENY` como respaldo de `frame-ancestors` (AC-1, AC-2).
- **Modo de la CSP en configuración** (`WEB_CSP_MODO`: `aplicar` | `solo_informe`, RN-22); `solo_informe` solo en
  `next dev` y rechazado al arrancar en producción.
- **Lista permitida de variables públicas** `config/public-env.allowlist.json` (vacía) y script
  `scripts/ci/public-env.mjs` en el job `quality`: falla nombrando toda `NEXT_PUBLIC_*` fuera de la lista (AC-4).
- **Escaneo de secretos del bundle**: tras `next build`, `.next/static/` se recorre con los patrones de `.gitleaks.toml`
  (US-036) y no debe haber coincidencias (AC-4). El import de `server-only` desde `'use client'` ya lo bloquea la regla
  `oncolens/no-restricted-imports-en-cliente` (US-215): aquí se añade como regresión.
- **XSS en texto generado** (AC-3): test de Testing Library con un `EvidenceAnalysis` sintético cuya síntesis y cita
  contienen `<img src=x onerror=alert(1)>` y `<script>`; `react/no-danger` (US-215) queda como regresión. Si un change del
  S6 habilita Markdown, va con `react-markdown` + `rehype-sanitize`, sin `rehype-raw` y con `urlTransform` restringido.
- **Enlaces de citas** (AC-5): `javascript:` y `data:` no crean enlace; los `https:` llevan `rel="noopener noreferrer"`,
  reutilizando `esUrlHttpSegura()` de `apps/web/lib/evidence/procedencia.ts`.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `web-bff`: requisitos **ADDED** de cabeceras de seguridad y CSP con nonce en toda respuesta de `web`, bloqueo del
  *framing* y ausencia de variables públicas no permitidas y de secretos en el bundle.
- `evidence-panel`: requisitos **ADDED** de texto generado o del corpus escapado ante HTML malicioso y de enlaces de
  citas solo con esquemas seguros.

## Bounded contexts

`frontend` (`apps/web/proxy.ts`, `apps/web/next.config.ts`, `apps/web/app/layout.tsx`, componentes de cita) y la CI del
job `quality` (`scripts/ci/`, `config/`). Sin `clinical-platform` (ningún Route Handler cambia de comportamiento) ni
`ai-services`.

## Dependencias

- ↪ US-034 (`web` levantado en Compose) y US-215 (ESLint base con `react/no-danger` y la regla de imports en cliente):
  ya en `main`.
- 🔗 Consumida por `l1d-314-spike-assistant-ui` (US-257 AC-2: el prototipo se prueba con esta CSP; si este change no
  está mergeado, el spike aplica la misma cabecera en su rama), `l1d-324-panel-conversacional` y
  `l1d-325-chat-fuentes-sin-perder-contexto` (sin violaciones de CSP, Markdown sin HTML crudo).
- 🔗 Relacionadas: US-144 (HSTS con HTTPS del piloto), US-061 (panel con texto del LLM).
- Orden sugerido: este change en la primera oleada del S6, antes de los changes de UI del chat.

## Fuera de alcance

HSTS y TLS (US-144). Rate limiting (RN-30). Auditoría de dependencias (US-217, ya en `main`). WAF o protección DDoS
(acceso solo por VPN). Endpoint de reportes de CSP (`report-uri`/`report-to`): no hay colector en el MVP.

## Pendientes de definir

- **P-1 — Decidido (usuario, 2026-11-06) [S6 resp. 19]: se acepta `style-src-attr 'unsafe-inline'`, sin tocar `script-src`, sin ADR.** (afecta AC-1): `style-src`. Propuesta: `style-src 'self' 'nonce-…'` y
  `style-src-attr 'unsafe-inline'` (Radix Dialog y Next ponen atributos `style`; un atributo `style` no ejecuta script).
  Si se rechaza, cada componente con `style=` se reescribe con clases. `script-src` no admite excepción.

## Impact

- `apps/web/proxy.ts`, `apps/web/next.config.ts`, `apps/web/app/layout.tsx` (lee el nonce y fuerza render dinámico),
  `apps/web/lib/server/` (constructor puro de la CSP y lector de `WEB_CSP_MODO`), componente de enlace de cita.
- `config/public-env.allowlist.json`, `scripts/ci/public-env.mjs`, job `quality`; `apps/web/tests/build/` (escaneo del
  bundle); `apps/web/e2e/` (E2E de clickjacking y de cabeceras).
- Sin dependencias npm nuevas, sin `NEXT_PUBLIC_` nuevas, sin cambios de contrato. `.env.example` gana `WEB_CSP_MODO`
  (tarea humana H-1).
