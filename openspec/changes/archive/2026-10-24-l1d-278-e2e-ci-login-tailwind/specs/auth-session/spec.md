## ADDED Requirements

### Requirement: La página de login usa el sistema de diseño sin cambiar su comportamiento
La página `/login` de `apps/web` MUST construirse con Tailwind v4 y los componentes de shadcn/ui (`Card`, `Input`, `Label`, `Button`, `Alert`) usando los tokens de `docs/ux/sistema-de-diseno.md`, sin CSS Modules propios, y MUST conservar sus textos, nombres accesibles, roles y comportamiento. A 375 y 1280 px MUST NOT haber errores de consola ni violaciones de CSP, ni *scroll* horizontal de página.

#### Scenario: El login migrado pasa el visual-check a 375 y 1280 px [ARR-02 AC-3]
- **GIVEN** el Compose fingido con el seed sintético y `/login` migrado a Tailwind v4 + shadcn/ui
- **WHEN** `visual-check` recorre `/login` (vacío, error de credenciales, enviando) a 375 y 1280 px
- **THEN** no hay errores de consola ni violaciones de CSP, no hay *scroll* horizontal, el foco es visible y los controles miden al menos 44 × 44 px

#### Scenario: El login migrado conserva textos y comportamiento [ARR-02 AC-3]
- **GIVEN** los tests de UI de login y los E2E de login y `sesion-y-origen.spec.ts`
- **WHEN** se ejecutan contra la página migrada
- **THEN** pasan sin cambiar sus aserciones y `apps/web/app/login/` no contiene archivos `.module.css`

#### Scenario: Credenciales inválidas muestran el error genérico con el componente Alert [ARR-02 AC-3]
- **GIVEN** la página migrada
- **WHEN** el usuario envía credenciales inválidas y el BFF responde `401`
- **THEN** se muestra «Correo o contraseña incorrectos.» en un `Alert` con `role="alert"`, sin revelar si la cuenta existe
