import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * Depura una traza de Playwright (`trace.zip`) antes de que salga del *runner* como artefacto (L1D-278, ARR-02, RN-14):
 * el repositorio es público y el artefacto es descargable. La traza guarda el cuerpo de cada request (`postData`), el
 * valor de cada `fill` y los valores de los `input` en los snapshots del DOM, así que:
 *   1. se eliminan los cuerpos de request y las respuestas de los `POST /api/*`, y
 *   2. se sustituye cada secreto de prueba que quede en cualquier entrada de texto.
 * Sin dependencias: el formato zip se lee y escribe aquí (solo `store` y `deflate`, sin zip64).
 */

export const MARCA_REDACTADO = '[REDACTADO]';

export type Entrada = { nombre: string; datos: Buffer };

const FIRMA_CABECERA_LOCAL = 0x04034b50;
const FIRMA_DIRECTORIO_CENTRAL = 0x02014b50;
const FIRMA_FIN_DE_DIRECTORIO = 0x06054b50;

export function leerZip(zip: Buffer): Entrada[] {
  const fin = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fin < 0 || zip.readUInt32LE(fin) !== FIRMA_FIN_DE_DIRECTORIO)
    throw new Error('depurar-traza: no es un zip válido');
  const total = zip.readUInt16LE(fin + 10);
  const entradas: Entrada[] = [];
  let cursor = zip.readUInt32LE(fin + 16);
  for (let i = 0; i < total; i += 1) {
    if (zip.readUInt32LE(cursor) !== FIRMA_DIRECTORIO_CENTRAL)
      throw new Error('depurar-traza: directorio central corrupto');
    const metodo = zip.readUInt16LE(cursor + 10);
    const tamanoComprimido = zip.readUInt32LE(cursor + 20);
    const largoNombre = zip.readUInt16LE(cursor + 28);
    const largoExtra = zip.readUInt16LE(cursor + 30);
    const largoComentario = zip.readUInt16LE(cursor + 32);
    const desplazamiento = zip.readUInt32LE(cursor + 42);
    const nombre = zip.subarray(cursor + 46, cursor + 46 + largoNombre).toString('utf8');
    const inicio =
      desplazamiento +
      30 +
      zip.readUInt16LE(desplazamiento + 26) +
      zip.readUInt16LE(desplazamiento + 28);
    const comprimido = zip.subarray(inicio, inicio + tamanoComprimido);
    if (metodo !== 0 && metodo !== 8)
      throw new Error(`depurar-traza: método de compresión ${metodo}`);
    if (!nombre.endsWith('/'))
      entradas.push({
        nombre,
        datos: metodo === 8 ? inflateRawSync(comprimido) : Buffer.from(comprimido),
      });
    cursor += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

export function escribirZip(entradas: Entrada[]): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const { nombre, datos } of entradas) {
    const nombreBytes = Buffer.from(nombre, 'utf8');
    const comprimido = deflateRawSync(datos);
    const crc = crc32(datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(FIRMA_CABECERA_LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nombre en UTF-8
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombreBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(FIRMA_DIRECTORIO_CENTRAL, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    local.copy(central, 8, 6, 8); // banderas
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nombreBytes.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    locales.push(local, nombreBytes, comprimido);
    centrales.push(central, nombreBytes);
    desplazamiento += local.length + nombreBytes.length + comprimido.length;
  }
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(FIRMA_FIN_DE_DIRECTORIO, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, directorio, fin]);
}

type RegistroDeRed = {
  type?: string;
  snapshot?: {
    request?: { method?: string; url?: string; postData?: { _sha1?: string; _file?: string } };
    response?: { content?: { _sha1?: string; _file?: string; text?: string } };
  };
};

const esPostDeApi = (metodo?: string, url?: string) => {
  if (metodo !== 'POST' || !url) return false;
  try {
    return new URL(url).pathname.startsWith('/api/');
  } catch {
    return false;
  }
};

/** `_file` trae la ruta (`resources/<sha1>.json`); las versiones anteriores de Playwright traían solo `_sha1`. */
const esElRecurso = (nombre: string, referencia: string) =>
  nombre === referencia || nombre.startsWith(`resources/${referencia}`);

/** Quita `postData` y las respuestas de `POST /api/*` del registro de red; devuelve el texto y los recursos huérfanos. */
function depurarRegistroDeRed(texto: string): { texto: string; recursos: Set<string> } {
  const recursos = new Set<string>();
  const lineas = texto.split('\n').map((linea) => {
    if (!linea.trim()) return linea;
    const registro = JSON.parse(linea) as RegistroDeRed;
    const { request, response } = registro.snapshot ?? {};
    if (registro.type !== 'resource-snapshot' || !request) return linea;
    for (const referencia of [request.postData?._sha1, request.postData?._file])
      if (referencia) recursos.add(referencia);
    delete request.postData;
    if (response?.content && esPostDeApi(request.method, request.url)) {
      for (const referencia of [response.content._sha1, response.content._file])
        if (referencia) recursos.add(referencia);
      delete response.content._sha1;
      delete response.content._file;
      delete response.content.text;
    }
    return JSON.stringify(registro);
  });
  return { texto: lineas.join('\n'), recursos };
}

/**
 * Formas en que un secreto puede quedar escrito en una traza: literal, escapado en JSON y codificado en URL. Se trabaja
 * en `latin1` (un carácter por byte) para sustituir en cualquier entrada, de texto o binaria, sin alterar los demás bytes.
 */
function variantesDe(secretos: string[]): string[] {
  const variantes = secretos
    .filter((secreto) => secreto.length > 0)
    .flatMap((secreto) => [
      secreto,
      JSON.stringify(secreto).slice(1, -1),
      encodeURIComponent(secreto),
    ]);
  return [...new Set(variantes)].map((variante) =>
    Buffer.from(variante, 'utf8').toString('latin1'),
  );
}

const sustituir = (datos: Buffer, variantes: string[]): Buffer => {
  const texto = datos.toString('latin1');
  const limpio = variantes.reduce(
    (acumulado, variante) => acumulado.replaceAll(variante, MARCA_REDACTADO),
    texto,
  );
  return limpio === texto ? datos : Buffer.from(limpio, 'latin1');
};

const contiene = (datos: Buffer, variantes: string[]) =>
  variantes.some((variante) => datos.toString('latin1').includes(variante));

/** Quita de las entradas los cuerpos de request y las respuestas de `POST /api/*` (registros de red y sus recursos). */
function quitarCuerposDeRed(entradas: Entrada[]): Entrada[] {
  const recursosAEliminar = new Set<string>();
  const sinReferencias = entradas.map((entrada) => {
    if (!entrada.nombre.endsWith('.network')) return entrada;
    const { texto, recursos } = depurarRegistroDeRed(entrada.datos.toString('utf8'));
    recursos.forEach((referencia) => recursosAEliminar.add(referencia));
    return { nombre: entrada.nombre, datos: Buffer.from(texto, 'utf8') };
  });
  return sinReferencias.filter(
    ({ nombre }) => ![...recursosAEliminar].some((referencia) => esElRecurso(nombre, referencia)),
  );
}

/** Depura el zip de la traza en el sitio. Si algún secreto sobrevive, lanza sin escribir nada. */
export function depurarTraza(ruta: string, secretos: string[]): void {
  const variantes = variantesDe(secretos);
  const resultado = quitarCuerposDeRed(leerZip(readFileSync(ruta))).map(({ nombre, datos }) => ({
    nombre,
    datos: sustituir(datos, variantes),
  }));
  const supervivientes = resultado.filter(({ datos }) => contiene(datos, variantes));
  if (supervivientes.length > 0)
    throw new Error(
      `depurar-traza: quedan secretos en ${supervivientes.map((e) => e.nombre).join(', ')}`,
    );
  writeFileSync(ruta, escribirZip(resultado));
}

/** Sustituye los secretos de un adjunto de texto (p. ej. `error-context.md`, que copia el valor de los `input`) en el sitio. */
export function depurarAdjuntoDeTexto(ruta: string, secretos: string[]): void {
  const datos = readFileSync(ruta);
  writeFileSync(ruta, sustituir(datos, variantesDe(secretos)));
}

/** Variables de entorno cuyo valor es una contraseña de E2E: `E2E_*CONTRASENA`. */
export function secretosDeE2e(entorno: NodeJS.ProcessEnv): string[] {
  return Object.entries(entorno)
    .filter(([nombre, valor]) => /^E2E_.*CONTRASENA$/.test(nombre) && valor)
    .map(([, valor]) => valor as string);
}

/** Falla cerrado: si la depuración no puede garantizar el adjunto limpio, se borra (nunca sube un artefacto sin depurar). */
export function depurarOBorrar(
  ruta: string,
  secretos: string[],
  depurar: typeof depurarTraza = depurarTraza,
): boolean {
  try {
    depurar(ruta, secretos);
    return true;
  } catch {
    rmSync(ruta, { force: true });
    return false;
  }
}
