>Detalla en esta sección los prompts principales utilizados durante la creación del proyecto, que justifiquen el uso de asistentes de código en todas las fases del ciclo de vida del desarrollo. Esperamos un máximo de 3 por sección, principalmente los de creación inicial o  los de corrección o adición de funcionalidades que consideres más relevantes.
Puedes añadir adicionalmente la conversación completa como link o archivo adjunto si así lo consideras


## Índice

1. [Descripción general del producto](#1-descripción-general-del-producto)
2. [Arquitectura del sistema](#2-arquitectura-del-sistema)
3. [Modelo de datos](#3-modelo-de-datos)
4. [Especificación de la API](#4-especificación-de-la-api)
5. [Historias de usuario](#5-historias-de-usuario)
6. [Tickets de trabajo](#6-tickets-de-trabajo)
7. [Pull requests](#7-pull-requests)

---

## 1. Descripción general del producto

**Prompt 1:**
**Rol:** Actúa como SW architect y Full-stack developer con 20 años de experiencia (usa las skills disponibles).
**Contexto:** Vas a redactar la Sección 1 del `readme.md` de OncoLens. Contexto de producto dado — tómalo como base, no lo reinterpretes: OncoLens es el proyecto final del Máster AI4Devs — una plataforma web donde un oncólogo consulta la fuente de información de un paciente (historia clínica, exámenes, biomarcadores en una BD relacional) y la cruza contra una BD vectorial con guías clínicas, ensayos y datos de investigación genómica, para sugerir el tratamiento personalizado con mayor probabilidad de éxito respaldado por evidencia científica.
**Tarea:** Redacta 1.1 Objetivo · 1.2 Características y funcionalidades principales · 1.3 Diseño y experiencia de usuario · 1.4 Instrucciones de instalación.
**Restricciones:**
1. No inventes ni una funcionalidad, tecnología o alcance fuera del contexto dado. Si falta un dato (stack tecnológico, si ya existen mockups, motor concreto de una pieza técnica), no lo asumas — confírmalo con preguntas (usa una skill tipo `/grill-me` si está disponible) antes de escribir esa parte.
2. Redacta 1.1/1.2 como borrador y pide confirmación antes de darlo por final. Distingue explícitamente funcionalidad *must-have* de *nice-to-have* si el usuario no priorizó — nunca presentes todo como igual de crítico.
3. Para 1.3, si no hay mockups, ofrece generarlos tú mismo (usa las herramientas de diseño/artefactos disponibles) dejando explícito que son "ilustrativos, no diseño final" — sugiere específicamente un panel del doctor (datos e historia del paciente) y un panel de interacción con la IA (fuentes de datos, filtros del paciente, resultado del análisis). No inventes hallazgos de investigación de usuarios (personas, entrevistas, tests de usabilidad) que no ocurrieron; considera accesibilidad básica (contraste, tamaño de texto, navegación por teclado) al proponer la UI. **Enfoque de diseño: Atomic Design** (Brad Frost) — descompón la UI en átomos (botón, badge, input), moléculas (campo con label, chip de fuente de datos), organismos (tabla de biomarcadores, tarjeta de recomendación), templates (layout del panel) y páginas (panel del doctor, panel de IA con datos reales) — esto es consistente con un sistema de componentes tipo shadcn/ui (2.2) y facilita mapear cada nivel a un componente reutilizable del frontend en vez de proponer pantallas monolíticas.
4. Para 1.4, pregunta el stack completo (frontend, backend(s), BD, gestores de paquetes) antes de escribir instrucciones — nunca inventes comandos de un framework no confirmado.
5. Toda decisión técnica pendiente se documenta como "🚧 Pendiente — requiere ADR" con alternativas concretas, nunca como decisión silenciosa tuya.
6. **Anti-alucinación:** prohibido nombrar una librería, servicio de terceros, versión específica o integración que no haya sido mencionada explícitamente por el usuario en el hilo — si la necesitas para justificar algo, pregúntala primero.
**Formato de salida:** Markdown con los encabezados exactos `1.1`–`1.4` del `readme.md`; 1.2 como lista numerada de funcionalidades; 1.3 con el enlace al mockup/Artifact y una nota explícita de "ilustrativo, no diseño final"; 1.4 con prerrequisitos + pasos numerados + bloque de comandos.
**Autoverificación:** ¿1.1/1.2 se derivan literalmente del contexto dado, sin nada inventado? ¿1.3 deja explícito que es ilustrativo? ¿1.4 evita cualquier comando de un stack no confirmado y marca lo pendiente como ADR en vez de asumirlo?


---

## 2. Arquitectura del Sistema

### **2.1. Diagrama de arquitectura:**

**Prompt 1:**
**Rol:** Actúa como arquitecto de software senior (20 años de experiencia), especializado en sistemas backend polyglot (Node.js + Python) y arquitecturas RAG.
**Contexto:** Lee las secciones 0 y 1 del `readme.md` de OncoLens. El stack acordado es: frontend Next.js/React 19; `clinical-api` (Node.js/Express 5, BFF — posee el registro clínico e identidad); `rag-orchestrator` (Python/FastAPI — posee el análisis clínico asistido por IA, retrieval híbrido dense/sparse contra Milvus, y la extracción de documentos vía OCR/LLM). Patrón de capas: Controller → Service → Repository (+ Adapters/domain en `rag-orchestrator`).
**Tarea:** Produce 2.1 completo: nombra el patrón arquitectónico, justifica el porqué (beneficios Y sacrificios explícitos, nunca solo lo positivo), y entrega un diagrama Mermaid de componentes más un diagrama de secuencia por cada uno de los 2 flujos de negocio principales (carga de documento vía OCR, consulta RAG).
**Restricciones:** La regla "`rag-orchestrator` nunca accede a PostgreSQL" debe quedar demostrada por **ausencia de flecha** en el diagrama, no solo mencionada en el texto. La consulta RAG pasa por un Route Handler de Next.js (proxy explícito hacia el BFF), nunca por una Server Action — y nunca se transmiten al navegador tokens del LLM sin validar (las citas se validan sobre la respuesta completa y el análisis se persiste antes de responder). Ninguna decisión de infraestructura o nomenclatura se asume: si algo no está confirmado, pregúntalo con 2-3 opciones y tu recomendación antes de dibujarlo. **Principio de menor privilegio:** verifica para cada flecha del diagrama (no solo la de Postgres) que el servicio de origen realmente necesita ese acceso para cumplir su función. No adoptes un patrón de moda (microservicios, event sourcing, CQRS) sin justificar que resuelve un problema real de este contexto — si el patrón elegido introduce complejidad no justificada, señálalo tú mismo como riesgo en los "sacrificios". **Anti-alucinación:** no cites una versión de librería, un SLA de latencia/disponibilidad, o una capacidad de un proveedor de LLM/cloud que no haya sido confirmada — si la necesitas para justificar una decisión, decláralo como supuesto explícito a validar, nunca como hecho.
**Formato de salida:** Mermaid válido para renderizar en GitHub (`flowchart` + 2× `sequenceDiagram`), con la justificación del patrón en prosa antes del diagrama.
**Autoverificación (ejecútala antes de entregar):** ¿Todo componente mencionado en el texto de 2.1 existe en el diagrama, y viceversa? ¿Hay alguna flecha que contradiga la regla de ownership? ¿Los 2 flujos de negocio principales tienen su propio diagrama de secuencia con el mecanismo de auth explícito en cada salto?

**Prompt 2:**
**Rol:** Actúa como arquitecto de software senior en modo **revisor adversarial** — no eres el autor del diagrama, tu trabajo es encontrarle fallas.
**Contexto:** El diagrama de 2.1 ya escrito, más el resto del `readme.md` (secciones 0, 1, y el resto de 2 si ya existe).
**Tarea:** Verifica que el diagrama contiene los elementos más relevantes de la arquitectura que interactúan en el proyecto. Es opcional el detalle de nombres exactos de clases/servicios, pero **no es negociable** que se omita un componente crítico (ej. la base de datos vectorial, el proveedor de LLM, el servicio de extracción de documentos).
**Restricciones:** Reporta cada hallazgo con severidad (Crítico/Importante/Menor), qué está mal y por qué importa (escenario concreto que falla), y 2-3 opciones de corrección con tu recomendación — no corrijas en silencio salvo que sea la finalización directa de una regla ya acordada en otra parte del documento (ahí sí, corrige y repórtalo como "corregido"). Revisa también higiene de nombres (consistencia, sin typos, mismo nombre en todos los diagramas) y que ninguna flecha implique una violación de seguridad (ej. un servicio sin privilegios llamando directo a un almacén de datos que no le corresponde).
**Formato de salida:** Lista de hallazgos priorizada por severidad, seguida del diagrama corregido solo si el usuario aprobó los cambios.
**Autoverificación:** Antes de cerrar, vuelve a aplicar el mismo chequeo sobre tu propia corrección — si un tipo de omisión apareció una vez, revisa si se repite en un lugar análogo del diagrama.

### **2.2. Descripción de componentes principales:**

**Prompt 1:**
**Rol:** Arquitecto de software senior documentando el sistema para un equipo que no participó en el diseño.
**Contexto:** El diagrama y la justificación de 2.1 ya escritos.
**Tarea:** Produce una tabla con un renglón por cada componente que aparece en el diagrama de 2.1 (ni uno más, ni uno menos) — columnas: Componente, Tecnología, Responsabilidad.
**Restricciones:** La responsabilidad de cada backend debe reflejar literalmente la regla de ownership de 2.1 (qué datos posee, qué nunca toca). No agregues un componente que no esté en el diagrama, ni omitas uno que sí esté. **Anti-alucinación:** la columna Tecnología lista solo tecnologías ya confirmadas en 2.1 — no agregues una versión específica de una librería que el usuario no haya dado explícitamente.
**Formato de salida:** Tabla Markdown de 3 columnas.
**Autoverificación:** Cuenta los nodos del diagrama de 2.1 y las filas de tu tabla — deben coincidir exactamente.

**Prompt 2:**
**Rol:** Editor técnico haciendo control de consistencia terminológica.
**Contexto:** Todo el `readme.md` más cualquier archivo de diagrama C4 aparte del documento.
**Tarea:** Confirma que el nombre de cada backend/servicio (ej. el servicio de IA/RAG) es idéntico en absolutamente todas las menciones — secciones 2, 3, 4, y en el archivo de diagramas C4.
**Restricciones:** Si encuentras un nombre inconsistente (resto de una decisión de nombre anterior), corrígelo en todos los archivos afectados, no solo en uno.
**Formato de salida:** Lista de las inconsistencias encontradas y dónde se corrigieron.
**Autoverificación:** Vuelve a buscar el nombre antiguo en todo el proyecto (`grep`) después de corregir — debe devolver cero resultados.

### **2.3. Descripción de alto nivel del proyecto y estructura de ficheros**

**Prompt 1:**
**Rol:** Arquitecto de software senior diseñando la organización de un monorepo.
**Contexto:** El patrón de capas y los componentes ya definidos en 2.1/2.2.
**Tarea:** Propone la estructura de carpetas del proyecto, reflejando exactamente las capas (Controller/Service/Repository, Adapters/domain) de cada backend.
**Restricciones:** La estructura debe hacer imposible, por organización de carpetas, que se viole la regla de ownership (ej. ningún backend sin acceso a un dato debería tener siquiera una carpeta sugiriendo ese acceso). Sigue las convenciones idiomáticas de cada lenguaje/framework (ej. estructura típica de un proyecto Node vs. uno Python) — no inventes una convención mixta que no exista en ningún ecosistema real.
**Formato de salida:** Árbol de directorios en bloque de código, con un comentario de una línea por carpeta principal explicando su propósito.
**Autoverificación:** ¿Cada carpeta de nivel superior corresponde a un componente real del diagrama de 2.1?

**Prompt 2:**
**Rol:** Arquitecto de software senior haciendo un benchmark comparativo de estructuras de monorepo.
**Contexto:** Tu propia propuesta de estructura, más una estructura de referencia alternativa (ej. organización `apps/`+`packages/`, módulos por dominio, capas hexagonales) que se te proporcione.
**Tarea:** Compara ambas estructura por estructura y decide qué vale la pena adoptar de la alternativa, con justificación arquitectónica concreta para cada adopción o rechazo.
**Restricciones:** Si la estructura de referencia contradice una regla ya acordada (ej. una carpeta que implicaría acceso a un dato prohibido), señálalo explícitamente como una inconsistencia a resolver, no la adoptes en silencio. No sobre-diseñes: si la alternativa introduce separaciones (ej. más servicios/módulos) que la complejidad real del proyecto no justifica, decláralo y descarta esa parte.
**Formato de salida:** Tabla comparativa (aspecto / estructura actual / propuesta / veredicto / por qué) + estructura final actualizada.
**Autoverificación:** ¿La estructura final sigue respetando todas las reglas de ownership y de capas ya acordadas?

### **2.4. Infraestructura y despliegue**

**Prompt 1:**
**Rol:** Ingeniero DevOps senior.
**Contexto:** Los componentes de 2.2 y sus tecnologías (bases de datos, servicios).
**Tarea:** Produce un diagrama de despliegue (Docker Compose u otro) que muestre cada contenedor y **sus dependencias reales** — si un componente (ej. una base de datos vectorial) requiere servicios auxiliares para correr en modo standalone, decláralos como contenedores propios, nunca los simplifiques a una sola caja.
**Restricciones:** No inventes una estrategia de despliegue a producción/cloud si el alcance del proyecto es solo ejecución local — decláralo explícitamente como fuera de alcance en vez de asumir un proveedor cloud. No asumas requisitos de recursos (CPU/memoria) ni límites de escalamiento sin que estén dados — si son necesarios, pregúntalos o márcalos como valores de referencia a validar. Cada servicio declara su `healthcheck`/orden de arranque (`depends_on: condition: service_healthy`) si otro servicio depende de él — no lo dejes implícito.
**Formato de salida:** Diagrama Mermaid del stack de Docker Compose + lista de prerrequisitos y comandos de arranque.
**Autoverificación:** ¿Cada tecnología mencionada en 2.2 tiene su contenedor (y sus dependencias) representado aquí? ¿Ningún servicio interno publica un puerto al host sin una razón declarada?

**Prompt 2:**

### **2.5. Seguridad**

**Prompt 1:**
**Rol:** Arquitecto de seguridad senior especializado en sistemas con datos sensibles.
**Contexto:** Los 2 backends y su mecanismo de comunicación definidos en 2.1.
**Tarea:** Documenta el mecanismo de autenticación de usuario (sesión) y el mecanismo de autenticación servicio-a-servicio como **dos sistemas explícitamente distintos y nunca intercambiables** — declara la regla en una frase memorable y verificable en el propio diagrama de secuencia de 2.1.
**Restricciones:** No asumas cómo se revoca una sesión, cómo se aísla la red entre servicios, ni la política de cifrado — si no están decididas, pregúntalas con opciones concretas antes de escribir la sección. Cubre explícitamente, además de la separación de credenciales: validación de entrada en cada borde (previene inyección SQL/NoSQL y XSS), manejo seguro de secretos (nunca hardcodeados — variables de entorno o vault), y principio de menor privilegio en cada integración entre servicios. **Anti-alucinación:** no afirmes que un control de seguridad está "implementado" si esto es documentación de diseño y no código verificado — usa "diseñado"/"especificado", y distingue explícitamente diseño de lo pendiente de implementar.
**Formato de salida:** Diagrama Mermaid del flujo de autenticación + lista de prácticas de seguridad con ejemplos concretos del proyecto.
**Autoverificación:** ¿Un lector podría confundir la credencial de sesión con la credencial de servicio después de leer esta sección? Si la respuesta no es un "no" rotundo, reescribe. ¿Cada práctica descrita indica si está diseñada o ya implementada?

**Prompt 2:**
**Rol:** Auditor de seguridad senior corriendo un checklist mínimo.
**Contexto:** La sección 2.5 ya escrita.
**Tarea:** Verifica que estén cubiertos, como mínimo: aislamiento de red entre servicios, minimización de datos entre servicios, cifrado en tránsito y en reposo, trazabilidad/auditoría, control de abuso (rate limiting), validación de entrada en cada borde, y manejo seguro de secretos/credenciales — usa la lista OWASP Top 10 como referencia de qué categorías de riesgo revisar, sin inventar un hallazgo que no aplique al proyecto.
**Restricciones:** Todo ítem del checklist que no esté resuelto se documenta explícitamente como "🚧 Pendiente — ADR futuro" con la pregunta exacta a responder — nunca se omite en silencio ni se asume una respuesta.
**Formato de salida:** El checklist con cada ítem marcado ✅ (cubierto, con referencia a dónde) o 🚧 (pendiente, con la pregunta).
**Autoverificación:** ¿Cada ítem 🚧 tiene una pregunta concreta y accionable, no solo "falta definir"?

### **2.6. Tests**

**Prompt 1:**
**Rol:** QA Lead / arquitecto de calidad senior.
**Contexto:** Los componentes y sus tecnologías (2.2) y los endpoints principales si 4 ya existe.
**Tarea:** Define la estrategia de testing por componente (unitario, integración, e2e) y una estrategia concreta de **contract testing** entre los backends para evitar drift entre sus contratos de API.
**Restricciones:** No propongas una herramienta de testing sin justificar por qué encaja con el stack ya definido en 2.1/2.2. La cobertura propuesta debe ser proporcional al riesgo (ej. lógica de autorización y el pipeline de datos clínicos ameritan más rigor que un formateador de fechas) — no des un porcentaje de cobertura objetivo sin justificarlo o sin marcarlo como "meta propuesta, a calibrar".
**Formato de salida:** Tabla (Servicio / Herramientas / Enfoque) + párrafo de contract testing.
**Autoverificación:** ¿La estrategia de contract testing realmente detectaría un cambio incompatible en el contrato antes de que llegue a producción?

**Prompt 2:**
**Rol:** QA Lead en modo **gap analysis** — buscando lo que la suite de pruebas NO cubre.
**Contexto:** La estrategia de tests ya escrita en 2.6.
**Tarea:** Identifica explícitamente qué garantiza la suite actual (que el sistema *funciona*) y qué NO garantiza (ej. que la calidad de las respuestas de un sistema con IA/RAG sea buena, no solo que responda).
**Restricciones:** Todo gap real se documenta como "🚧 Pendiente — ADR futuro", nunca se finge cobertura que no existe.
**Formato de salida:** Un párrafo o bullet explícito por cada gap encontrado, con su ADR pendiente asociado.
**Autoverificación:** ¿Un evaluador externo podría, leyendo solo 2.6, saber exactamente qué NO está probado todavía?

### **2.7. Observabilidad**

**Prompt 1:**
**Rol:** SRE / arquitecto de plataforma senior.
**Contexto:** Lee 2.1 (arquitectura) y 2.5 (Seguridad) — la sección de Observabilidad debe ser **complementaria, no redundante** con la trazabilidad de negocio ya cubierta en Seguridad.
**Tarea:** Documenta cómo se diagnostica el sistema en ejecución: logs estructurados con un identificador de correlación propagado entre todos los servicios de una misma request, métricas expuestas por cada servicio, y health checks usados para el orden de arranque de la infraestructura.
**Restricciones:** No propongas una herramienta de monitoreo/visualización (ej. un stack de dashboards) como si ya estuviera decidida si no lo está — decláralo como "🚧 Pendiente — ADR futuro" y explica qué complejidad de infraestructura evita posponerla. No dupliques contenido ya cubierto en 2.5 (trazabilidad de negocio/evidencia) — referencia esa sección en vez de repetirla. No inventes un SLA de disponibilidad ni un volumen de tráfico esperado si no fue dado — cualquier umbral de alerta se marca como "propuesto, a calibrar".
**Formato de salida:** Lista de capacidades (logs, métricas, health checks) con el mecanismo concreto de cada una, seguida de lo pendiente marcado como ADR.
**Autoverificación:** Si alguien reporta "la consulta X falló", ¿esta sección explica cómo reconstruir qué pasó usando solo logs/métricas, cruzando los dos backends? Si no, falta el identificador de correlación o su propagación.

---

## 3. Modelo de Datos

**Prompt 1:**
**Rol:** Actúa como arquitecto de datos senior.
**Contexto:** Vas a producir la Sección 3 del `readme.md` de OncoLens, alineada estrictamente con las secciones 1 y 2 ya escritas — léelas antes de modelar cualquier entidad.
**Tarea:** Propone a alto-mediano nivel el modelo de datos para los datos clínicos del paciente y cómo se almacenarán los documentos fuente (ej. JATS/XML/PDF) de guías y tratamientos científicos — un diagrama por cada almacén de datos distinto que la arquitectura definió (nunca mezcles en un solo ER motores de datos distintos como si tuvieran FKs reales entre sí).
**Restricciones:**
1. No asumas nada: si encuentras un punto de diseño genuinamente abierto (granularidad de una entidad, dónde vive un archivo binario, cómo se versiona algo que cambia en el tiempo, qué tan estricto es el control de acceso), preséntalo como pregunta con 2-3 opciones, tu recomendación, y por qué descartas cada alternativa — espera confirmación antes de modelarlo.
2. Si hay datos sensibles (personales/salud), aborda explícitamente minimización de datos hacia servicios que no deberían verlos, trazabilidad/auditoría, y consentimiento de uso si aplica. Señala explícitamente qué campos son PII/PHI en cada entidad — no asumas que es obvio cuál lo es.
3. Normaliza hasta 3FN salvo razón explícita de rendimiento para desnormalizar (y en ese caso, justifícalo). Toda FK declara su comportamiento de borrado/actualización (`CASCADE`/`RESTRICT`/`SET NULL`) explícitamente, nunca implícito.
4. **Anti-alucinación de BD:** no inventes un tipo de dato, función o sintaxis de constraint que el motor real (ej. PostgreSQL) no soporte — si tienes duda sobre la sintaxis exacta, decláralo en vez de inventar una que suene plausible.
5. Una vez tengas un primer modelo, haz tú mismo un **Review adversarial** crítico y detallista contra las secciones 1 y 2: busca activamente contradicciones (algo que otra sección dice que se persiste pero no tiene entidad; un campo que no representa lo que muestra un mockup o flujo ya definido; una regla de seguridad de la sección 2 que el modelo no refleja) y repórtalas con opciones/recomendación antes de corregir.
6. Cierra cada punto de diseño abierto como una decisión explícita documentada (no como pregunta sin resolver) en una subsección de ADRs derivados del modelo, cada una con su justificación — nunca los dejes flotando indefinidamente.
**Formato de salida:** Un bloque Mermaid `erDiagram` por almacén de datos, con tipos, PK/FK/UK y comentarios en cada atributo no obvio; descripción de entidades en prosa/tabla; subsección final "ADRs derivados del modelo" numerada con la pregunta a responder en cada una.
**Autoverificación:** ¿Toda entidad referenciada en una relación del `erDiagram` está declarada? ¿Toda entidad "que puede venir de un documento externo" tiene forma de saber de dónde vino? ¿Algo que 1 o 2 ya prometieron se quedó sin dónde vivir en el modelo?

---

## 4. Especificación de la API

**Prompt 1:**
**Rol:** Actúa como arquitecto de APIs senior.
**Contexto:** Vas a producir la Sección 4 del `readme.md` de OncoLens, en coherencia estricta con las secciones 1-3 — los nombres de campo, entidades y reglas de ownership ya están decididos ahí, no se renegocian aquí.
**Tarea:** Documenta en OpenAPI los endpoints principales de **cada** backend definido en la arquitectura (no solo el que da la cara al cliente) — si existe una API pública (BFF) y una interna/servicio-a-servicio, documenta ambas por separado con el mecanismo de autenticación exacto de cada una (debe coincidir con 2.5).
**Restricciones:**
1. Todo schema de request/response reutiliza exactamente los nombres/tipos de campo ya definidos en la sección 3 — cero inconsistencia entre el modelo de datos y el contrato de API.
2. Si un servicio interno no tiene acceso a cierto almacén de datos (por la regla de ownership de la sección 2), su contrato NO puede recibir solo un identificador que ese servicio no podría resolver por sí mismo — debe recibir el payload ya resuelto por quien sí tiene acceso. Verifícalo explícitamente antes de terminar.
3. Los códigos de error reflejan reglas de negocio/seguridad ya definidas (autorización, validación, consentimiento), no códigos genéricos sin fundamento. Usa el código HTTP semánticamente correcto (401 = no autenticado, 403 = autenticado sin permiso, 404 = no existe, 422 = validación) — nunca uses 200 con un campo `error` en el body para una falla real.
4. Sigue convenciones REST estándar: sustantivos en plural para colecciones, el verbo HTTP correcto según la operación (no uses `POST` para algo idempotente que debería ser `PUT`/`PATCH`). Todo endpoint que devuelva una colección declara su estrategia de paginación, o la marca explícitamente como "🚧 Pendiente — ADR".
5. Todo endpoint que dispare un efecto asíncrono/costoso (ej. una carga que activa un proceso externo) declara cómo se evita duplicar el efecto ante un reintento (idempotency key o equivalente) — si no está decidido, decláralo pendiente en vez de omitirlo.
**Formato de salida:** Un bloque `yaml` OpenAPI 3.0 por API (pública / interna), con `components.schemas` reutilizables; al menos un ejemplo real de petición y respuesta en `json` para el endpoint más crítico del producto.
**Autoverificación:** Valida sintácticamente lo que escribiste — el YAML debe parsear como OpenAPI válido y los JSON de ejemplo deben ser JSON válido; ejecuta esa validación, no la des por sentada. ¿Cada nombre de campo del schema existe literalmente en la sección 3?

---

## 5. Historias de Usuario

**Prompt 1:**
**Rol:** Actúa como Product Manager senior especializado en entrega ágil.
**Contexto:** Vas a producir la Sección 5 del `readme.md` de OncoLens, en coherencia con las secciones 1-4 ya escritas, en dos partes.
**Tarea — Parte A (Slicing del alcance por sprints):** cada sprint entrega algo funcional, demostrable de forma end-to-end (walking skeleton que crece) — el usuario final (el doctor) está en capacidad de ver y usar el software desde el primer sprint. La ingesta de datos pesada corre en un carril paralelo que no bloquea la demostrabilidad temprana. El slicing es *customer & value focused* de principio a fin: el orden es estrictamente de mayor a menor valor de negocio, y en los últimos sprints van las funcionalidades que menos valor aportan — si no llegaran a ejecutarse, el flujo principal debe seguir funcionando y seguir demostrando el objetivo central (cruzar información clínica del paciente con evidencia científica para sugerir el mejor tratamiento). Cada sprint lleva un Objetivo (OKR) con Key Results medibles.
**Tarea — Parte B (Historias de usuario):** selecciona las más representativas de los primeros sprints (el "corazón" del producto) y documenta cada una con esta estructura exacta: Declaración (Como/Quiero/Para) · Contexto y Alcance (Descripción/Entidades afectadas/Restricciones) · Criterios de Aceptación en Gherkin (mínimo 2 escenarios: uno feliz, uno de error/alternativo) · Datos de Entrada y Salida.
**Restricciones:**
1. Cada entidad/endpoint mencionado en una historia debe existir literalmente en las secciones 3 y 4 — nunca inventes un campo, rol de usuario o ruta nuevos dentro de una historia. Si la historia necesita algo que no existe todavía en el modelo/API, es una señal de que falta una historia previa o un ajuste al diseño — repórtalo, no lo inventes.
2. Si una historia de un sprint temprano depende de una capacidad que tu propio slicing ubicó en un sprint posterior, dilo explícitamente en Restricciones ("en este sprint no existe todavía X; se agrega en el Sprint N") — nunca lo dejes implícito.
3. Al menos un escenario de error/alternativo por historia describe un comportamiento de seguridad o manejo de fallos, no solo un caso de validación trivial.
4. Cada historia debe cumplir el criterio **INVEST** (Independiente, Negociable, Valiosa, Estimable, Small, Testable) — si una historia no es independiente o no es "small", divídela en vez de forzarla en una sola.
5. Sin datos históricos para calibrar una meta de un OKR, propónla marcada explícitamente como "propuesta, a calibrar" — nunca la presentes como un compromiso ya validado.
**Formato de salida:** Parte A como tabla o lista por sprint (Objetivo/OKR, alcance incluido, alcance explícitamente excluido y en qué sprint se resuelve); Parte B con la plantilla exacta de historia (Declaración/Contexto y Alcance/Gherkin/I-O) una por historia.
**Autoverificación:** Revisa cruzado cada historia contra tu propio slicing: ¿la restricción que declaraste en cada una es coherente con lo que el slicing dice que existe en ese sprint?
>
*Documenta el slicing del alcance por sprints "iterativo e incremental, customer y value focus" · agregar detalle/OKR por sprint y seleccionar 5 historias de usuario con la plantilla estructurada Gherkin.*

---

## 6. Tickets de Trabajo

**Prompt 1:**
**Rol:** Actúa como tech lead senior full-stack (Node.js/Express, Python/FastAPI, Next.js, PostgreSQL/Prisma, Milvus) responsable de convertir historias de usuario en trabajo ejecutable por un equipo — o por un agente de codificación — sin ambigüedad.
**Contexto:** Las secciones 1-5 del `readme.md` de OncoLens ya están escritas: arquitectura (2), modelo de datos (3), contratos OpenAPI (4) y slicing por sprints + historias HU-01 a HU-05 (5). Esas secciones son la fuente de verdad; un ticket no las renegocia.
**Tarea:** Crea la sección 6 con el **top 5 de tickets de mayor impacto de los Sprints 1 y 2**, cubriendo al menos uno de base de datos, uno de backend y uno de frontend. Antes de los tickets, explicita el criterio de impacto y una tabla de selección; lista también el backlog restante de esos sprints que no se detalla.
**Restricciones:**
1. Criterio de impacto explícito: cuánto desbloquea el flujo central (login → paciente → pregunta → tratamiento con evidencia), cuánto materializa una regla arquitectónica no negociable (ownership de datos, *Doctor session ≠ Service credential*, anonimización) y cuánto riesgo técnico adelanta.
2. Cada ticket lleva: ID, tipo, sprint, servicio, HU, prioridad · objetivo · alcance incluido y **no incluido** (indicando en qué sprint llega lo excluido) · dependencias y bloqueos · tareas técnicas por capa (Controller/Service/Repository, Adapters, `domain/`) · tests con las herramientas de 2.6 · criterios de aceptación verificables · riesgos · preguntas abiertas.
3. **Anti-invención:** cada entidad, campo, endpoint y herramienta debe existir en las secciones 2-5. Si un ticket necesita algo que el documento no define (un campo, un endpoint, una regla, un mecanismo), no lo decidas en silencio: regístralo como **pregunta abierta** con opciones y recomendación. Todo valor numérico sin respaldo (timeouts, tamaños, umbrales) se marca *"propuesta, a calibrar"*.
4. Buenas prácticas obligatorias según el tipo: BD (restricciones, índices derivados de accesos reales, comportamiento de FKs, migración y seed idempotente con datos sintéticos); backend (validación en el borde, mapeo de errores sin filtrar detalles internos, idempotencia, transacciones, no-fuga de PII en logs y payloads); frontend (Atomic Design sobre shadcn/ui, todos los estados de la UI incluidos vacío y error, accesibilidad, tipos importados de `packages/api-contracts`).
5. Un ticket nunca asume una decisión que sigue siendo ADR pendiente (motor OCR, proveedor de LLM/embeddings): la declara como bloqueo y, si es posible, desacopla el trabajo detrás de una interfaz/adapter.
**Formato de salida:** Markdown — `6.0` (criterio, tabla top 5, backlog no detallado, Definition of Done común) y un bloque por ticket con encabezado `OL-0N · [Tipo] Título`.
**Autoverificación:** ¿Cada criterio de aceptación es verificable por un test o una inspección concreta? ¿Algún ticket contradice un contrato de la sección 4 o una regla de 2.5? ¿Cada inconsistencia que encontraste entre secciones quedó como pregunta abierta, en vez de corregirse en silencio o ignorarse?

**Prompt 2:**
**Rol:** Actúa como arquitecto de software senior en modo **decisor crítico**: tu trabajo es cerrar preguntas abiertas con argumentos, no con preferencias.
**Contexto:** Las preguntas abiertas registradas en los tickets de la sección 6, más todo el `readme.md`.
**Tarea:** Para cada pregunta abierta, propone una solución y las ideas descartadas. Si la incertidumbre es alta, recomienda dejarla como ADR para investigarla y decidir con evidencia. Una vez el usuario apruebe, aplica las decisiones en **todas** las secciones afectadas (no solo en el ticket) y resúmelas en una tabla de decisiones.
**Restricciones:**
1. Por pregunta: contexto en una línea · 2-4 opciones · propuesta · por qué se descarta cada alternativa · nivel de incertidumbre · ¿ADR? (sí solo si la decisión requiere investigación o medición que aún no existe).
2. Revisa críticamente tus propias recomendaciones previas: si al profundizar una resulta débil (p. ej. una métrica que mide otra cosa de lo que su nombre promete), corrígela y dilo de forma explícita.
3. Prioriza la seguridad clínica sobre la conveniencia técnica: ninguna decisión puede mostrar al médico contenido sin validar, ni alterar en silencio datos que alimentan una recomendación.
4. No apliques cambios hasta que el usuario elija; al aplicarlos, propaga cada decisión a modelo (3), contratos (4), slicing/historias (5), `CLAUDE.md` y el diagrama C4 si cambian nombres o responsabilidades.
**Formato de salida:** Lista numerada por ticket con la estructura de la restricción 1 y una tabla resumen (# · propuesta · ¿ADR?). Tras la aprobación: subsección `6.1` con la tabla de decisiones (pregunta · decisión · descartado · estado · dónde se refleja).
**Autoverificación:** Tras aplicar, ¿quedó alguna referencia a "pregunta abierta" sin resolver? ¿Los bloques OpenAPI siguen validando y los ejemplos JSON siguen siendo válidos? ¿El diagrama C4 y `CLAUDE.md` reflejan las decisiones?

---

## 7. Pull Requests

🚧 Pendiente — esta sección del `readme.md` aún no se ha desarrollado.
