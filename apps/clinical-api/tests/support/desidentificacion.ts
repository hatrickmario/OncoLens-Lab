import { readFileSync } from 'node:fs';
import path from 'node:path';
import { crearDetectorOpcionA } from '../../src/modules/evidence-analysis/deidentification/pii-detector.opcion-a.js';
import {
  cargarConfiguracionDePii,
  type ConfiguracionDePii,
} from '../../src/modules/evidence-analysis/deidentification/pii-formats.config.js';
import type {
  IdentidadDelPaciente,
  PatientIdentityReader,
  PiiDetectorFactory,
} from '../../src/modules/evidence-analysis/ports.js';

/**
 * Soporte de la desidentificación (L1D-203): la configuración REAL de PII del repositorio (los mismos
 * `config/pii-formats.json` y `pii-masks.json` que carga `clinical-api`), un repositorio de identidad FALSO
 * (la identidad cifrada llega con US-046) y fakes que fallan, para probar el fallo cerrado. Datos sintéticos (RN-13).
 */

const RAIZ_CLINICAL_API = path.resolve(import.meta.dirname, '../..');
const RAIZ_REPO = path.resolve(RAIZ_CLINICAL_API, '../..');
export const MINIMO_DE_TOKEN_DE_NOMBRE = 3;

export function configuracionDePiiDeTest(): ConfiguracionDePii {
  return cargarConfiguracionDePii(
    {
      formatsPath: path.join(RAIZ_REPO, 'config/pii-formats.json'),
      masksPath: path.join(RAIZ_CLINICAL_API, 'config/pii-masks.json'),
      nameTokenMinLength: MINIMO_DE_TOKEN_DE_NOMBRE,
    },
    (ruta) => readFileSync(ruta, 'utf8'),
  );
}

/** El detector de la opción A con la configuración real del repositorio. */
export function detectoresReales(): PiiDetectorFactory {
  const configuracion = configuracionDePiiDeTest();
  return { para: (identidad) => crearDetectorOpcionA(identidad, configuracion) };
}

/** Repositorio de identidad falso: la identidad de cada paciente por su id; `null` si no tiene identidad registrada. */
export function lectorDeIdentidadFalso(
  porPaciente: Record<string, IdentidadDelPaciente>,
): PatientIdentityReader {
  return { leer: (patientId) => Promise.resolve(porPaciente[patientId] ?? null) };
}

/** Lector de identidad que lanza una excepción (la identidad no se pudo leer). */
export function lectorDeIdentidadCaido(): PatientIdentityReader {
  return {
    leer: () => Promise.reject(new Error('identidad no disponible (fallo simulado)')),
  };
}

/** Detector que lanza al enmascarar (el motor de PII está caído). */
export function detectoresCaidos(): PiiDetectorFactory {
  return {
    para: () => ({
      enmascarar: () => {
        throw new Error('detector de PII caído (fallo simulado)');
      },
    }),
  };
}

/** Detector que cuenta cuántas veces se construyó: prueba que la guarda de entorno corta ANTES de enmascarar. */
export function detectoresContados(base: PiiDetectorFactory): {
  fabrica: PiiDetectorFactory;
  construidos(): number;
} {
  let construidos = 0;
  return {
    fabrica: {
      para: (identidad) => {
        construidos += 1;
        return base.para(identidad);
      },
    },
    construidos: () => construidos,
  };
}
