import { describe, expect, it } from 'vitest';
import { cargarEtiquetasDeDatosCriticos } from '../../../src/modules/evidence-analysis/etiquetas-datos-criticos.js';

const RUTA = '/catalogo-sintetico';

/** Archivos del catálogo montado, servidos desde memoria: el borde de E/S es el lector de archivos. */
function lectorDe(archivos: Record<string, unknown>): (ruta: string) => string {
  return (ruta) => {
    const contenido = archivos[ruta];
    if (contenido === undefined) throw new Error(`sin archivo ${ruta}`);
    return JSON.stringify(contenido);
  };
}

const item = (key: string, es: string) => ({ key, label: { es, en: es } });

describe('cargarEtiquetasDeDatosCriticos', () => {
  const lector = lectorDe({
    [`${RUTA}/manifest.json`]: { version: 'sint-1.0.0', cancerTypes: ['mama', 'prostata'] },
    [`${RUTA}/mama/datos-criticos.json`]: {
      items: [item('ki67', 'Ki-67'), item('estado_menopausico', 'Estado menopáusico')],
    },
    [`${RUTA}/prostata/datos-criticos.json`]: {
      items: [item('psa_serie', 'PSA seriado'), item('ki67', 'Otra etiqueta')],
    },
  });

  it('devuelve el label.es del catálogo cuando la clave pertenece a cualquier tipo del manifiesto', () => {
    const etiquetaDe = cargarEtiquetasDeDatosCriticos(RUTA, lector);

    expect(etiquetaDe('estado_menopausico')).toBe('Estado menopáusico');
    expect(etiquetaDe('psa_serie')).toBe('PSA seriado');
  });

  it('prevalece la primera etiqueta en el orden del manifiesto cuando una clave se repite entre tipos', () => {
    expect(cargarEtiquetasDeDatosCriticos(RUTA, lector)('ki67')).toBe('Ki-67');
  });

  it('devuelve undefined cuando el catálogo no conoce la clave', () => {
    expect(cargarEtiquetasDeDatosCriticos(RUTA, lector)('desconocida')).toBeUndefined();
  });
});
