## ADDED Requirements

### Requirement: Los E2E de Playwright corren en la CI contra el Compose fingido
Un workflow `.github/workflows/e2e.yml`, separado de `ci.yml`, MUST ejecutar en cada PR y en cada `push` a `main` `npm run test:e2e` contra el Compose en perfil de test con `LLM_PROVIDER=fake`, `MODEL_PROVIDER=fake` y el seed sintético, con Docker en el *runner*, `retries: 1` solo en la CI, *trace* del reintento y el informe como artefacto. Ningún E2E MUST estar marcado con `.skip`, `.only` ni `fixme`. Mientras no cumpla el criterio de estabilidad, el workflow MUST NOT formar parte de `ci-ok`.

#### Scenario: El job de E2E ejecuta todos los E2E en la CI [ARR-02 AC-1]
- **GIVEN** un PR y el workflow `e2e.yml`
- **WHEN** corre el job de E2E
- **THEN** levanta el Compose fingido, ejecuta los E2E de login, panel, aviso de IA, lenguaje no prescriptivo y `sesion-y-origen.spec.ts` sin `.skip`, y termina en verde

#### Scenario: Los reintentos y la traza solo existen en la CI [ARR-02 AC-1]
- **GIVEN** `apps/web/playwright.config.ts`
- **WHEN** se carga con `CI=true` y sin `CI`
- **THEN** con `CI=true` usa `retries: 1` y `trace: 'on-first-retry'`, y sin `CI` usa `retries: 0`

#### Scenario: Un E2E en rojo deja el informe y la traza como artefacto [ARR-02 AC-1]
- **GIVEN** un E2E que falla también en su reintento
- **WHEN** termina el job de E2E
- **THEN** el job termina en `failure` y publica el informe HTML y la traza del reintento como artefacto, sin afectar a `ci-ok`

#### Scenario: La traza y los artefactos no exponen credenciales [ARR-02 AC-1] (asumido) [RN-14]
- **GIVEN** un E2E de login fallido con un usuario de test sintético que se reintenta en la CI
- **WHEN** el job publica la traza como artefacto
- **THEN** la traza no contiene cuerpos de request ni la contraseña de prueba, y el artefacto se publica con retención de 3 días

#### Scenario: Un E2E desactivado se rechaza [ARR-02 AC-1]
- **GIVEN** un archivo de `apps/web/e2e/` con `test.skip`, `test.only` o `test.fixme`
- **WHEN** corre el job de E2E
- **THEN** termina en `failure` nombrando el archivo
