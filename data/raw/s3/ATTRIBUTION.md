# Atribución y verificación de fuentes del corpus ampliado (US-120, ADR-36)

Estado: **borrador de la tarea 1.1**. El manifiesto `manifest.yaml` y los textos de `docs/` aún no existen (tareas 1.2 y 1.3,
pendientes: exigen descargar documentos). Aquí solo constan las verificaciones documentales hechas el 2026-11-03 contra
fuentes oficiales; lo no verificado queda marcado y no se inventa.

## Verificado (2026-11-03)

- **NCI** (<https://www.cancer.gov/policies/copyright-reuse>): «Unless otherwise indicated, all text within National Cancer
  Institute (NCI) products is free of copyright and may be reused without our permission. Credit the National Cancer
  Institute as the source.» «The NCI logo and the PDQ trademark may only be used in reproductions of original, wholly
  unchanged NCI products.» La página no dice que PDQ deje de actualizarse (el pendiente de ADR-36 sobre ese aviso sigue sin
  confirmación en esa página; `/syndication` no se pudo comprobar).
- **NLM / ClinicalTrials.gov** (<https://www.nlm.nih.gov/web_policies.html>): la política de NLM pide reconocer a NLM con la
  frase «Courtesy of the National Library of Medicine» o «Source: National Library of Medicine». La página **no** incluye
  «U.S.» (la Enmienda 1 de ADR-36 cita «Courtesy of the U.S. National Library of Medicine») y no trae una política propia de
  ClinicalTrials.gov: remite a «Copyright Information & Downloading National Library of Medicine Data».

## Sin verificar (pregunta abierta para el orquestador)

- Texto literal de atribución y términos de uso de la API v2 de ClinicalTrials.gov (la página de términos se sirve con
  JavaScript y no se pudo leer; ver `/policy` y la documentación de la API).
- Nombres exactos de los campos de licencia del JSON de PMC / Europe PMC (`README.txt` del bucket `pmc-oa-opendata`).
- Número de resúmenes PDQ de mama y próstata en EN y ES (la página índice no lo publica).
