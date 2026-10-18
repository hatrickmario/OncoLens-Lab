# Procedimiento: excepción ADR-26 (cambio aditivo que oasdiff marca como ERR)

Cuando `scripts/ci/contracts-breaking.sh <base>` da un ERR sobre un cambio **aditivo** (p. ej. `response-body-one-of-added` o `response-property-enum-value-added` en un código de error), la excepción se declara así. Lo hizo tres veces el S1 (E-1, E-2, E-3). **Solo con la decisión directa del humano** en la sesión principal: es una decisión de contrato que el clasificador de permisos trata como bypass de CI, y un agente no puede aplicarla con una aprobación relayada.

1. Mide el hallazgo: corre el script sobre la rama y copia el texto exacto del ERR (proveedor, regla, operación, ruta, texto).
2. Pide la decisión con la alternativa descartada y la recomendación (el patrón aditivo es compatible hacia atrás si los consumidores clasifican por código HTTP y de error).
3. Con el sí, en la rama del change (nunca en `main` antes de que exista el ERR): añade la entrada `E-n` a `scripts/ci/contracts-breaking-excepciones.json` con `id`, `adr: ADR-26`, `documento`, `change`, `proveedor`, `regla`, `operacion`, `ruta` y `texto` exactos.
4. Añade la fila `E-n` a la tabla de `docs/architecture/adr/ADR-26-contrato-congelado-y-excepciones-declaradas.md` con el motivo y la fecha de la decisión.
5. Actualiza `scripts/ci/__tests__/excepcionesDeContrato.test.mjs` para que declare la lista completa (`['E-1', …, 'E-n']`); no se relaja ninguna aserción.
6. Verifica: `scripts/ci/contracts-breaking.sh origin/main` sale sin ERR no declarados y un ERR distinto del mismo proveedor sigue rompiendo.
7. La excepción se borra o migra cuando `contracts:breaking` de US-214 sustituya al script, o cuando el cambio pase a ser la base de la comparación.
