---
name: principal-duplicada-gemma4
description: Por qué gemma4 emitía dos afirmaciones principal en rn23-local y s5, cómo se corrigió y qué no funciona en la gramática de Ollama
metadata:
  type: project
---

El LLM local (gemma4:26b-a4b-it-q4_K_M) devolvía `principal_duplicada` en la suite `rn23-local --suite all` y `s5 --suite opciones`; NO era regresión de L1D-113 (también falla en el padre `8386c316`, rag-query@0.6.0): el esquema de la salida era una lista plana `claims[]` con `role` y ni el prompt ni la gramática pueden forzar «exactamente una principal». La suite local de L1D-295/298 pasaba porque usaba solo las 6 preguntas de `local.yaml` (FX-T5a-a).

**Why:** Ollama NO honra `prefixItems` (aplica `items` a todos los elementos y deja cero principales); reforzar el prompt ("la PRIMERA es la única principal") solo adelantó el fallo una pregunta. Lo que funciona es que el esquema no deje elegir el papel de la central: `main_claim` (sin papel) + `other_claims` (secundaria|salvedad), fix de D5-06 (`rag-query@0.8.0`).
**How to apply:** si vuelve una invariante de «exactamente uno» sobre una lista del LLM, modelarla en el esquema como campo propio, no como rol en una lista; y cualquier `LlmSalidaInvalidaError` por pregunta ya no aborta `evaluate` (código 5, sección `salidas_invalidas`). Entorno: el Bash del agente rechaza `source`, variables en rutas y `sed -i`; usar lanzadores `.py` (ver [[medicion-local-evaluate]]). Ollama.app respawnea `ollama serve`: hay que matar el proceso padre `Ollama.app` antes de arrancar el propio.
