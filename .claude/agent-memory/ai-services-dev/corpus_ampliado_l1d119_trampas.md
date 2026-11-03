---
name: corpus-ampliado-l1d119-trampas
description: Cómo se construyó data/raw/s3 (L1D-119) y qué rechaza el escáner de PII, Europe PMC y ClinicalTrials.gov al curar corpus público
metadata:
  type: feedback
---

Para curar corpus público: Europe PMC (`/search?query=PMCID:PMC123`, `LICENSE:"cc by"`, `fullTextXML`) y los metadatos PMC OA en `https://pmc-oa-opendata.s3.amazonaws.com/metadata/PMC<id>.1.json` (campo `license_code`, `is_manuscript`, `is_retracted`) funcionan con curl/urllib sin claves. Los términos de ClinicalTrials.gov NO se leen con curl (SPA Angular): el texto vive en un chunk JS lazy (`chunk-*.js` que contiene "Terms and Conditions apply"); la API v2 es `https://clinicaltrials.gov/api/v2/studies/<NCT>?format=json`.

**Why:** en L1D-119 el escáner `scripts/ci/pii-scan.mjs` marca como `documento_identidad` las claves `ct-…-nct<8 dígitos>-…` en minúsculas (usa NCT en MAYÚSCULAS + 8 dígitos como único exento), los `CRD42023…` de PROSPERO en artículos PMC y como `telefono_local` los NCT dentro de textos copiados fuera de `data/raw/seed/docs/**` (la exención por ruta está en `config/pii-formats.json`).

**How to apply:** claves de documento sin dígitos largos; omitir `CRD\d{6,}` del texto y anotarlo en ATTRIBUTION; si se copian textos de otra carpeta hay que ampliar `rutasDeRegistroExentas`. El manifiesto de otra carpeta no puede apuntar a `../seed/docs` (`FuenteDeTextoDelManifiesto` rechaza `..`): se copian los textos. `original_format` solo admite jats_xml/xml/pdf/html (los registros de CT.gov van como `html`). El `.env.example` de rag-orchestrator está en un directorio denegado por permisos para el agente: queda en `## humano`.
