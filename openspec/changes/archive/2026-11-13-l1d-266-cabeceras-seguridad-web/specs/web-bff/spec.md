## ADDED Requirements

### Requirement: Toda respuesta de web lleva una CSP con nonce por request
`web` MUST enviar en toda página y Route Handler una `Content-Security-Policy` con `default-src 'self'`, `script-src` con un nonce nuevo por request y sin `'unsafe-inline'` ni `'unsafe-eval'`, `object-src 'none'`, `base-uri 'none'` y `frame-ancestors 'none'`. El modo SHALL leerse de `WEB_CSP_MODO` (RN-22); `solo_informe` MUST NOT aceptarse en producción.

#### Scenario: Página y Route Handler llevan la CSP estricta [US-216 AC-1] [RN-14] [NFR-11]
- **GIVEN** la build de producción de `web` en Compose con seed sintético y `WEB_CSP_MODO=aplicar`
- **WHEN** se piden `/login`, `/pacientes` con sesión de `doc1@test.local` y `GET /api/patients/{id}/case`
- **THEN** cada respuesta incluye `Content-Security-Policy` con `default-src 'self'`, `object-src 'none'`, `base-uri 'none'` y `frame-ancestors 'none'`
- **AND** su `script-src` contiene `'nonce-` y no contiene `'unsafe-inline'` ni `'unsafe-eval'`

#### Scenario: El nonce cambia en cada request y lo llevan los scripts del framework [US-216 AC-1] (asumido)
- **GIVEN** la misma build
- **WHEN** se pide `/login` dos veces
- **THEN** los dos nonces de la cabecera son distintos
- **AND** cada `<script>` del HTML lleva el atributo `nonce` igual al de su respuesta y la consola del navegador no registra violaciones de CSP

#### Scenario: El modo solo_informe se rechaza en producción [US-216 AC-1] [RN-22] (asumido)
- **GIVEN** `NODE_ENV=production` y `WEB_CSP_MODO=solo_informe`
- **WHEN** arranca `web`
- **THEN** el arranque falla nombrando `WEB_CSP_MODO`, sin imprimir otros valores de configuración

### Requirement: Cabeceras de endurecimiento en toda respuesta de web
`web` MUST enviar en toda respuesta, incluidos los estáticos, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` y una `Permissions-Policy` que deniega cámara, micrófono y geolocalización. El `Cache-Control: no-store` y la redirección sin sesión SHALL seguir aplicándose solo a `/pacientes/*`.

#### Scenario: Cabeceras presentes en página, Route Handler y estático [US-216 AC-1] [NFR-11] (asumido en la lista exacta)
- **GIVEN** la build de producción de `web`
- **WHEN** se piden `/login`, `POST /api/auth/login` sin cuerpo válido y un archivo de `/_next/static/`
- **THEN** las tres respuestas llevan `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` y `X-Frame-Options: DENY`
- **AND** `Permissions-Policy` contiene `camera=()`, `microphone=()` y `geolocation=()`

#### Scenario: Sin sesión, /pacientes sigue redirigiendo al login con la CSP [US-216 AC-1] [RN-10]
- **GIVEN** un navegador sin cookie de sesión
- **WHEN** pide `/pacientes`
- **THEN** recibe la redirección a `/login` sin la ruta original en la URL y la página de login llega con la CSP

### Requirement: web no se puede cargar dentro de un frame ajeno
Ninguna página de `web`, incluida `/login`, MUST renderizarse dentro de un `<iframe>` de otro origen.

#### Scenario: Una página externa no puede enmarcar /login ni /pacientes [US-216 AC-2] (asumido)
- **GIVEN** una página de prueba servida por Playwright en otro origen con dos `<iframe>` hacia `/login` y `/pacientes` de `web`
- **WHEN** el navegador la renderiza
- **THEN** ningún frame carga contenido de `web` (el documento del frame no contiene el formulario de login) y la consola registra el bloqueo por `frame-ancestors`

### Requirement: Solo variables públicas permitidas y ningún secreto en el bundle
El job `quality` MUST fallar nombrando toda variable `NEXT_PUBLIC_*` usada en `apps/web` o declarada en sus `.env*` que no esté en `config/public-env.allowlist.json`, y todo import de `server-only` o `lib/server` desde un módulo `'use client'`. Tras `next build`, `.next/static/` MUST NOT contener coincidencias de los patrones de `.gitleaks.toml`.

#### Scenario: Variable pública fuera de la lista permitida [US-216 AC-4] [RN-14] [PRD §11 #12]
- **GIVEN** un fixture de `apps/web` con `NEXT_PUBLIC_CENTINELA_L1D266` en `.env` y en un componente, y la lista permitida vacía
- **WHEN** corre `scripts/ci/public-env.mjs`
- **THEN** termina con código distinto de 0 y su salida nombra `NEXT_PUBLIC_CENTINELA_L1D266` y el archivo, sin imprimir su valor

#### Scenario: La lista permitida vacía y el árbol actual pasan [US-216 AC-4]
- **GIVEN** el árbol de `apps/web` de la rama y `config/public-env.allowlist.json` vacía
- **WHEN** corre `scripts/ci/public-env.mjs`
- **THEN** termina con código 0

#### Scenario: Un componente cliente que importa server-only falla en el lint [US-216 AC-4] [US-215 AC-3]
- **GIVEN** el fixture `cliente-importa-server.tsx` con `'use client'` e import de `@/lib/server/clinical-api`
- **WHEN** corre `npm run lint` del bloque `web`
- **THEN** falla con `oncolens/no-restricted-imports-en-cliente` nombrando el archivo y la línea

#### Scenario: El bundle de producción no contiene secretos [US-216 AC-4] [RN-14]
- **GIVEN** `next build` de `web` con secretos centinela sintéticos en las variables de servidor (`CLINICAL_API_URL` y una clave con forma de clave privada PEM)
- **WHEN** se recorren los archivos de `apps/web/.next/static/` con los patrones de `.gitleaks.toml` y los valores centinela
- **THEN** no hay coincidencias y el reporte lista solo rutas, nunca valores
