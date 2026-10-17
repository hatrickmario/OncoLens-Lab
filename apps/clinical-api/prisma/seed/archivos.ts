import { readFileSync } from 'node:fs';
import type { LeerArchivo } from '../../src/config/secrets.js';

/** Lector real de archivos de texto; el resto del seed lo recibe inyectado (determinista en test). */
export const leerArchivoDeTexto: LeerArchivo = (ruta) => readFileSync(ruta, 'utf8');
