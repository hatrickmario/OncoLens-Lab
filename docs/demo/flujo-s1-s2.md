# Flujo del análisis de evidencia (S1 y S2 implementados)

Diagrama de alto nivel para la Demo 2. Muestra los componentes que intervienen desde que el oncólogo inicia sesión hasta que ve el resultado. Naranja: pasos con modelos de IA · verde: reglas deterministas · azul: almacenes de datos.

```mermaid
flowchart TD
    DOC["Oncólogo<br/>navegador"]

    subgraph WEB["web · Next.js BFF · único puerto publicado"]
        W1["Login con cookie de sesión<br/>listado y ficha del paciente<br/>panel de análisis"]
    end

    subgraph CAPI["clinical-api · Express · dueño de los datos clínicos"]
        C1["Sesión y roles RBAC"]
        C2["Ficha del paciente<br/>identidad cifrada AES-256"]
        C3["Desidentificación<br/>sin nombre, fechas relativas, id aleatorio"]
        C4["Límite de consultas<br/>y tiempo máximo"]
        C6["Guarda el análisis<br/>ANTES de responder"]
    end

    PG[("PostgreSQL<br/>clínico, identidad, auditoría")]

    subgraph RAG["rag-orchestrator · FastAPI · sin acceso a datos clínicos"]
        R1["1. Embeddings BGE-M3<br/>pregunta + resumen clínico"]
        R2["2. Búsqueda densa en Milvus<br/>top 30 fragmentos"]
        R3["3. Corte a 12 pares<br/>RERANKER_MAX_PAIRS"]
        R4["4. Reranker bge-reranker-v2-m3<br/>puntaje 0 a 1"]
        R5{"¿Algún fragmento<br/>sobre 0,30?"}
        R6["Sin evidencia<br/>no se llama al LLM"]
        R7["5. LLM local Ollama<br/>una sola pasada<br/>propone opciones con citas"]
        R8["6. Validar citas<br/>el chunkId debe existir"]
        R9["7. NLI mDeBERTa<br/>¿el texto respalda la afirmación?"]
        R10["8. Política de lenguaje<br/>sin términos prescriptivos<br/>y recorte a maxOptions"]
    end

    MIL[("Milvus<br/>corpus indexado<br/>dense + sparse")]
    PGC[("PostgreSQL<br/>schema corpus<br/>catálogo de fuentes")]
    OLL["Ollama nativo<br/>gemma4 26B<br/>fuera de Docker"]
    LOG["Logs con traceId<br/>sin PHI ni textos"]

    DOC --> W1 --> C1 --> C2
    C2 <--> PG
    C2 --> C3 --> C4
    C4 -- "JWT de servicio" --> R1
    R1 --> R2 <--> MIL
    R2 --> R3 --> R4 --> R5
    R5 -- "no" --> R6
    R5 -- "sí" --> R7
    R7 <--> OLL
    R7 --> R8 --> R9 --> R10
    R4 -.-> PGC
    R10 --> C6
    R6 --> C6
    C6 --> PG
    C6 --> W1
    R2 -.-> LOG
    R4 -.-> LOG
    R10 -.-> LOG
    C4 -.-> LOG

    classDef ia fill:#fde7c8,stroke:#c27c0e,color:#222;
    classDef dato fill:#d9ecff,stroke:#2b6cb0,color:#222;
    classDef regla fill:#e2f5e1,stroke:#2f855a,color:#222;
    class R1,R2,R3,R4,R7,R9 ia;
    class R5,R6,R8,R10,C3,C4 regla;
    class PG,MIL,PGC dato;
```

## Qué contar
- **Una sola pasada del LLM.** El segundo loop con reescritura de consulta (US-238) está planificado para el S4.
- **Sin evidencia no se llama al LLM:** si ningún fragmento supera 0,30 (`RELEVANCE_THRESHOLD`), la respuesta es corta y sin costo de generación (RN-02).
- **El reranker solo ve 12 de los 30 candidatos** (`RERANKER_MAX_PAIRS`, ADR-39): una errata en la pregunta cambia qué 12 entran.
- **El análisis se guarda antes de responder** (RN-06).
- **La identidad nunca sale de `clinical-api`:** el servicio de IA solo recibe datos desidentificados (RN-10, RN-11).
- **Una consulta a la vez en la demo.** Tres análisis simultáneos tumbaron `rag-orchestrator` por memoria; lo cubre US-239 (S4).

## Parámetros
`RETRIEVAL_TOP_K=30` · `RERANKER_MAX_PAIRS=12` · `RERANK_TOP_N=10` · `RELEVANCE_THRESHOLD=0.30` · modelos: BGE-M3, bge-reranker-v2-m3, mDeBERTa NLI, gemma4 26B (Ollama).

Estado a 2026-10-23. Cuando cambie el flujo (S3 en adelante), este diagrama se actualiza.
