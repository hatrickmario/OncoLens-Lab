/**
 * Refinamientos del Zod generado (US-214 AC-6, design D3). `@hey-api/openapi-ts` no traduce a Zod los `if/then/else`, los
 * `anyOf` de restricciones (`required`/`properties` sueltos) ni `allOf` con `unevaluatedProperties: false`, así que un
 * consumidor que valida con el Zod estricto aceptaría lo que el spec rechaza (`sin_evidencia` con `topRelevanceScore: 0.0`,
 * una cita con una propiedad no evaluada...). Aquí se genera, desde el spec empaquetado, `refinamientos.gen.ts`: un
 * `z<Nombre>Refinado = z.unknown().superRefine(...).pipe(z<Nombre>)` por cada schema con refinamientos propios o heredados
 * de sus propiedades, ítems o `allOf`. Los refinamientos recorren la entrada cruda guiados por el spec (no por el Zod): el
 * `z.object` que genera hey-api para un `allOf` abierto descarta en silencio las propiedades desconocidas.
 *
 * Falla cerrado: una construcción que el generador no sabe traducir (una palabra clave fuera del subconjunto, una forma de
 * `if/then` desconocida, un `oneOf` que contiene un schema con refinamientos...) lanza un error que nombra el schema y la
 * construcción; nunca se omite en silencio. Módulo puro: recibe el spec ya empaquetado y devuelve texto.
 */

const REF_DE_SCHEMA = /^#\/components\/schemas\/([A-Za-z0-9]+)$/;
/** Palabras clave que el generador no traduce en ningún sitio del spec. */
const NO_TRADUCIBLES = ['not', 'dependentRequired', 'dependentSchemas', 'patternProperties', 'contains', 'minContains', 'maxContains', 'prefixItems', 'propertyNames', 'unevaluatedItems', '$dynamicRef', '$anchor'];
/** Claves de un schema cuyo valor es un mapa de nombre → schema (los nombres no son palabras clave). */
const MAPAS_DE_SCHEMAS = new Set(['properties', '$defs']);
/** Claves cuyo valor es un dato, no un schema. */
const DATOS = new Set(['enum', 'const', 'examples', 'example', 'default', 'required', 'x-permission', 'x-view-by-permission']);
/** Claves de un schema de condición (`if`, `then`, `else`, miembros de `anyOf`) que el generador entiende. */
const CLAVES_DE_RESTRICCION = new Set(['properties', 'required', 'type', 'description']);
const CLAVES_DE_PROPIEDAD = new Set(['enum', 'const', 'type', 'minItems', 'maxItems', 'description', 'examples', 'title']);
const TIPOS = new Set(['null', 'string', 'number', 'integer', 'boolean', 'array', 'object']);

class ConstruccionNoTraducible extends Error {
  constructor(donde, construccion) {
    super(`refinamientos: ${donde} usa ${construccion}, que el generador no sabe traducir a Zod (falla cerrado; ampliar scripts/contracts/lib/refinamientos.mjs con su test)`);
  }
}

const esObjeto = (valor) => typeof valor === 'object' && valor !== null && !Array.isArray(valor);
const literal = (valor) => JSON.stringify(valor);
const claveTs = (clave) => literal(clave);

/** Recorre todos los schemas de un nodo (sin descender a datos ni a nombres de propiedades) llamando a `visitar(nodo, ruta)`. */
function recorrer(nodo, ruta, visitar) {
  if (Array.isArray(nodo)) {
    nodo.forEach((hijo, indice) => recorrer(hijo, `${ruta}/${indice}`, visitar));
    return;
  }
  if (!esObjeto(nodo)) return;
  visitar(nodo, ruta);
  for (const [clave, valor] of Object.entries(nodo)) {
    if (DATOS.has(clave)) continue;
    if (MAPAS_DE_SCHEMAS.has(clave) && esObjeto(valor)) {
      for (const [nombre, hijo] of Object.entries(valor)) recorrer(hijo, `${ruta}/${clave}/${nombre}`, visitar);
    } else {
      recorrer(valor, `${ruta}/${clave}`, visitar);
    }
  }
}

function describirRestriccion(esquema) {
  const partes = [];
  for (const [nombre, sub] of Object.entries(esquema.properties ?? {})) {
    if (sub.enum) partes.push(`${nombre} en ${literal(sub.enum)}`);
    else if ('const' in sub) partes.push(`${nombre} = ${literal(sub.const)}`);
    else partes.push(`${nombre}: ${literal(sub)}`);
  }
  for (const nombre of esquema.required ?? []) partes.push(`${nombre} presente`);
  return partes.join(' y ') || 'siempre';
}

/** Exige que un schema de condición use solo el subconjunto traducible. */
function exigirRestriccion(esquema, donde) {
  if (!esObjeto(esquema)) throw new ConstruccionNoTraducible(donde, 'un schema de condición que no es un objeto');
  for (const clave of Object.keys(esquema)) {
    if (!CLAVES_DE_RESTRICCION.has(clave)) throw new ConstruccionNoTraducible(donde, `la palabra clave «${clave}» en una condición`);
  }
  for (const [nombre, sub] of Object.entries(esquema.properties ?? {})) {
    if (!esObjeto(sub)) throw new ConstruccionNoTraducible(donde, `la propiedad «${nombre}» sin schema`);
    for (const clave of Object.keys(sub)) {
      if (!CLAVES_DE_PROPIEDAD.has(clave)) throw new ConstruccionNoTraducible(donde, `la palabra clave «${clave}» en la propiedad «${nombre}» de una condición`);
    }
    for (const tipo of [sub.type].flat().filter(Boolean)) {
      if (!TIPOS.has(tipo)) throw new ConstruccionNoTraducible(donde, `el tipo «${tipo}» en la propiedad «${nombre}» de una condición`);
    }
    if ('const' in sub && (esObjeto(sub.const) || Array.isArray(sub.const))) throw new ConstruccionNoTraducible(donde, `un const compuesto en la propiedad «${nombre}»`);
  }
}

/** Expresión TS que es true si `x` cumple las restricciones de una propiedad. */
function predicadoDePropiedad(sub, x) {
  const partes = [];
  if (sub.enum) partes.push(`esUnoDe(${x}, ${literal(sub.enum)})`);
  if ('const' in sub) partes.push(`${x} === ${literal(sub.const)}`);
  if (sub.type) partes.push(`(${[sub.type].flat().map((tipo) => `esTipo(${x}, ${literal(tipo)})`).join(' || ')})`);
  if (sub.minItems !== undefined) partes.push(`(!Array.isArray(${x}) || ${x}.length >= ${Number(sub.minItems)})`);
  if (sub.maxItems !== undefined) partes.push(`(!Array.isArray(${x}) || ${x}.length <= ${Number(sub.maxItems)})`);
  return partes.length > 0 ? partes.join(' && ') : 'true';
}

/** Expresión TS que es true si el objeto `o` cumple las restricciones (`properties` solo si presentes, `required`). */
function predicadoDeRestriccion(esquema, o) {
  const partes = [
    ...Object.entries(esquema.properties ?? {}).map(([nombre, sub]) => `(!tiene(${o}, ${claveTs(nombre)}) || (${predicadoDePropiedad(sub, `${o}[${claveTs(nombre)}]`)}))`),
    ...(esquema.required ?? []).map((nombre) => `tiene(${o}, ${claveTs(nombre)})`),
  ];
  return partes.length > 0 ? partes.join(' && ') : 'true';
}

/** Sentencias que añaden una incidencia por cada propiedad de la rama (`then`/`else`) que el objeto `o` incumple. */
function comprobacionesDeRama(rama, o, ruta, etiqueta, donde) {
  exigirRestriccion(rama, donde);
  const sentencias = [];
  for (const [nombre, sub] of Object.entries(rama.properties ?? {})) {
    const mensaje = literal(`${etiqueta}: ${nombre} debe cumplir ${literal(sub)}`);
    sentencias.push(`if (tiene(${o}, ${claveTs(nombre)}) && !(${predicadoDePropiedad(sub, `${o}[${claveTs(nombre)}]`)})) ctx.addIssue({ code: 'custom', path: [...${ruta}, ${claveTs(nombre)}], message: ${mensaje} });`);
  }
  for (const nombre of rama.required ?? []) {
    sentencias.push(`if (!tiene(${o}, ${claveTs(nombre)})) ctx.addIssue({ code: 'custom', path: [...${ruta}, ${claveTs(nombre)}], message: ${literal(`${etiqueta}: falta ${nombre}`)} });`);
  }
  return sentencias;
}

/** ¿Es un `anyOf` de restricciones sueltas (sin `type` ni `$ref`) y no una unión de schemas completos? */
function esAnyOfDeRestricciones(miembros) {
  if (miembros.length === 0) return false;
  const sueltos = miembros.map((miembro) => esObjeto(miembro) && !miembro.$ref && !miembro.type && !miembro.allOf && !miembro.oneOf && !miembro.anyOf && !miembro.items);
  if (sueltos.every(Boolean)) return true;
  if (sueltos.some(Boolean)) return 'mixto';
  return false;
}

/**
 * Genera `refinamientos.gen.ts` de un proveedor desde su spec empaquetado.
 * @param {any} spec spec empaquetado (`bundled`) del proveedor
 * @param {string} encabezado primera línea del archivo (la marca de generado)
 * @returns {string} texto TypeScript
 */
export function generarRefinamientos(spec, encabezado) {
  const schemas = spec?.components?.schemas ?? {};
  for (const nombre of Object.keys(schemas)) {
    if (!/^[A-Za-z0-9]+$/.test(nombre)) throw new ConstruccionNoTraducible(`el schema «${nombre}»`, 'un nombre con caracteres que Zod renombra');
  }
  verificarConstruccionesProhibidas(spec);

  const resolver = (ref, donde) => {
    const nombre = REF_DE_SCHEMA.exec(ref)?.[1];
    if (!nombre || !schemas[nombre]) throw new ConstruccionNoTraducible(donde, `la referencia «${ref}»`);
    return { nombre, esquema: schemas[nombre] };
  };

  const memo = new Map();
  /** ¿Este nodo (o algo que alcanza) lleva refinamientos? Los ciclos no añaden refinamientos por sí solos. */
  function tiene(nodo, donde, enCurso = new Set()) {
    if (!esObjeto(nodo)) return false;
    if (nodo.$ref) {
      const { nombre, esquema } = resolver(nodo.$ref, donde);
      if (memo.has(nombre)) return memo.get(nombre);
      if (enCurso.has(nombre)) return false;
      enCurso.add(nombre);
      const resultado = tiene(esquema, nombre, enCurso);
      enCurso.delete(nombre);
      memo.set(nombre, resultado);
      return resultado;
    }
    if (propios(nodo)) return true;
    return hijos(nodo).some((hijo) => tiene(hijo, donde, enCurso));
  }
  // Un anyOf que mezcla restricciones sueltas y schemas completos cuenta como propio para que `comprobaciones` lo rechace.
  const propios = (nodo) => nodo.if !== undefined || (Array.isArray(nodo.anyOf) && esAnyOfDeRestricciones(nodo.anyOf) !== false) || nodo.unevaluatedProperties === false;
  const hijos = (nodo) => [
    ...Object.values(nodo.properties ?? {}),
    ...(nodo.items ? [nodo.items] : []),
    ...(nodo.allOf ?? []),
    // Las alternativas con refinamientos no se pueden traducir: se alcanzan para que `comprobaciones` falle cerrado.
    ...(nodo.oneOf ?? []),
    ...(esAnyOfDeRestricciones(nodo.anyOf ?? []) === true ? [] : (nodo.anyOf ?? [])),
  ];

  /** Sentencias que comprueban el valor `v` contra los refinamientos de `nodo`. */
  function comprobaciones(nodo, v, ruta, donde, nivel) {
    if (!esObjeto(nodo)) return [];
    if (nodo.$ref) {
      const { nombre } = resolver(nodo.$ref, donde);
      return tiene(nodo, donde) ? [`verificar${nombre}(${v}, ctx, ${ruta});`] : [];
    }
    for (const clave of ['oneOf', 'anyOf']) {
      const miembros = nodo[clave] ?? [];
      const restricciones = clave === 'anyOf' ? esAnyOfDeRestricciones(miembros) : false;
      if (restricciones === 'mixto') throw new ConstruccionNoTraducible(donde, 'un anyOf que mezcla restricciones sueltas y schemas completos');
      if (restricciones === false && miembros.some((miembro) => tiene(miembro, donde))) {
        throw new ConstruccionNoTraducible(donde, `un ${clave} cuyas alternativas llevan refinamientos`);
      }
    }
    const propiasDelObjeto = [];
    const o = `objeto${nivel}`;
    if (nodo.if !== undefined) propiasDelObjeto.push(...condicional(nodo, o, ruta, donde));
    if (Array.isArray(nodo.anyOf) && esAnyOfDeRestricciones(nodo.anyOf) === true) propiasDelObjeto.push(...alternativas(nodo.anyOf, o, ruta, donde));
    if (nodo.unevaluatedProperties === false) propiasDelObjeto.push(...noEvaluadas(nodo, o, ruta, donde));
    if (nodo.unevaluatedProperties !== undefined && nodo.unevaluatedProperties !== false) throw new ConstruccionNoTraducible(donde, 'unevaluatedProperties distinto de false');

    const descenso = [];
    for (const [nombre, sub] of Object.entries(nodo.properties ?? {})) {
      if (!tiene(sub, `${donde}.${nombre}`)) continue;
      const hijo = `hijo${nivel}`;
      descenso.push(`if (tiene(${o}, ${claveTs(nombre)})) {`, `const ${hijo} = ${o}[${claveTs(nombre)}];`, ...comprobaciones(sub, hijo, `[...${ruta}, ${claveTs(nombre)}]`, `${donde}.${nombre}`, nivel + 1), '}');
    }
    for (const miembro of nodo.allOf ?? []) {
      descenso.push(...comprobaciones(miembro, v, ruta, donde, nivel + 1));
    }
    const sentencias = [];
    if (propiasDelObjeto.length > 0 || descenso.length > 0) {
      sentencias.push(`if (esObjeto(${v})) {`, `const ${o} = ${v};`, ...propiasDelObjeto, ...descenso, '}');
    }
    if (nodo.items !== undefined && tiene(nodo.items, `${donde}[]`)) {
      const elemento = `elemento${nivel}`;
      const indice = `indice${nivel}`;
      sentencias.push(`if (Array.isArray(${v})) {`, `${v}.forEach((${elemento}: unknown, ${indice}: number) => {`, ...comprobaciones(nodo.items, elemento, `[...${ruta}, ${indice}]`, `${donde}[]`, nivel + 1), '});', '}');
    }
    return sentencias;
  }

  function condicional(nodo, o, ruta, donde) {
    exigirRestriccion(nodo.if, `${donde} (if)`);
    if (nodo.then === undefined && nodo.else === undefined) throw new ConstruccionNoTraducible(donde, 'un if sin then ni else');
    const condicion = describirRestriccion(nodo.if);
    const siCumple = nodo.then !== undefined ? comprobacionesDeRama(nodo.then, o, ruta, `${donde}: si ${condicion}`, `${donde} (then)`) : [];
    const siNoCumple = nodo.else !== undefined ? comprobacionesDeRama(nodo.else, o, ruta, `${donde}: si no ${condicion}`, `${donde} (else)`) : [];
    return [`if (${predicadoDeRestriccion(nodo.if, o)}) {`, ...siCumple, '} else {', ...siNoCumple, '}'];
  }

  function alternativas(miembros, o, ruta, donde) {
    miembros.forEach((miembro, indice) => exigirRestriccion(miembro, `${donde} (anyOf/${indice})`));
    const algunaCumple = miembros.map((miembro) => `(${predicadoDeRestriccion(miembro, o)})`).join(' || ');
    const mensaje = literal(`${donde}: debe cumplir al menos una alternativa: ${miembros.map(describirRestriccion).join(' o ')}`);
    return [`if (!(${algunaCumple})) ctx.addIssue({ code: 'custom', path: [...${ruta}], message: ${mensaje} });`];
  }

  /** Nombres de propiedad que declara el schema o alguno de sus `allOf` (resueltos). */
  function propiedadesEvaluadas(nodo, donde) {
    const nombres = new Set(Object.keys(nodo.properties ?? {}));
    for (const miembro of nodo.allOf ?? []) {
      const resuelto = miembro.$ref ? resolver(miembro.$ref, donde).esquema : miembro;
      for (const clave of ['oneOf', 'anyOf', 'if', 'patternProperties', 'additionalProperties']) {
        if (resuelto[clave] !== undefined) throw new ConstruccionNoTraducible(donde, `un allOf con un miembro que usa «${clave}»`);
      }
      propiedadesEvaluadas(resuelto, donde).forEach((nombre) => nombres.add(nombre));
    }
    return nombres;
  }

  function noEvaluadas(nodo, o, ruta, donde) {
    const permitidas = [...propiedadesEvaluadas(nodo, donde)].sort();
    return [
      `const permitidas = new Set<string>(${literal(permitidas)});`,
      `for (const clave of Object.keys(${o})) if (!permitidas.has(clave)) ctx.addIssue({ code: 'custom', path: [...${ruta}, clave], message: ${literal(`${donde}: propiedad no evaluada por el schema`)} });`,
    ];
  }

  // Un refinamiento fuera de components.schemas (schema en línea de una operación) no tendría dónde exportarse.
  recorrer(spec.paths ?? {}, '#/paths', (nodo, ruta) => {
    if (propios(nodo)) throw new ConstruccionNoTraducible(ruta, 'un refinamiento (if/anyOf/unevaluatedProperties) en un schema en línea de una operación');
  });

  const refinados = Object.keys(schemas).sort().filter((nombre) => tiene({ $ref: `#/components/schemas/${nombre}` }, nombre));
  const funciones = refinados.map((nombre) => {
    const cuerpo = comprobaciones(schemas[nombre], 'valor', 'ruta', nombre, 0);
    return indentar([`function verificar${nombre}(valor: unknown, ctx: Contexto, ruta: Ruta): void {`, ...cuerpo, '}']);
  });
  return [
    encabezado,
    '',
    "import * as z from 'zod';",
    refinados.length > 0 ? `import { ${refinados.map((nombre) => `z${nombre}`).join(', ')} } from './zod.gen';` : '',
    '',
    AYUDAS,
    ...funciones,
    // Los refinamientos miran la entrada CRUDA, antes del Zod: un z.object sin strict descarta en silencio las propiedades
    // desconocidas y el refinamiento ya no podría verlas. Si falla un refinamiento, no se ejecuta el Zod estricto.
    ...refinados.map((nombre) => `export const z${nombre}Refinado = z.unknown().superRefine((valor, ctx) => verificar${nombre}(valor, ctx, [])).pipe(z${nombre});`),
    '',
  ]
    .filter((bloque, indice, todos) => !(bloque === '' && todos[indice - 1] === ''))
    .join('\n');
}

/** Sangra por llaves: una línea que empieza con `}` dedenta y una que termina en `{` indenta (las emite este módulo con esa forma). */
function indentar(lineas) {
  let nivel = 0;
  const sangradas = lineas.map((linea) => {
    if (linea.startsWith('}')) nivel -= 1;
    const sangrada = `${'  '.repeat(Math.max(nivel, 0))}${linea}`;
    if (linea.endsWith('{')) nivel += 1;
    return sangrada;
  });
  return sangradas.join('\n');
}

/** Palabras clave que no se traducen en ninguna parte del spec: se detectan antes de generar. */
function verificarConstruccionesProhibidas(spec) {
  recorrer({ paths: spec.paths ?? {}, components: spec.components?.schemas ?? {} }, '#', (nodo, ruta) => {
    for (const clave of NO_TRADUCIBLES) {
      if (clave in nodo) throw new ConstruccionNoTraducible(ruta, `la palabra clave «${clave}»`);
    }
  });
}

const AYUDAS = `type Ruta = readonly PropertyKey[];
type Contexto = { addIssue(incidencia: { code: 'custom'; message: string; path?: PropertyKey[] }): void };

const esObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === 'object' && valor !== null && !Array.isArray(valor);
const tiene = (objeto: Record<string, unknown>, clave: string): boolean => Object.hasOwn(objeto, clave);
const esUnoDe = (valor: unknown, posibles: readonly unknown[]): boolean => posibles.includes(valor);
const esTipo = (valor: unknown, tipo: string): boolean => {
  if (tipo === 'null') return valor === null;
  if (tipo === 'array') return Array.isArray(valor);
  if (tipo === 'object') return esObjeto(valor);
  if (tipo === 'integer') return Number.isInteger(valor);
  return typeof valor === tipo;
};
`;
