import { describe, expect, it } from 'vitest';
import { extraerBanderas } from '../g-demo/banderas.mjs';
import { cargarMetas } from '../g-demo/metricas.mjs';
import { renderizarRegistro } from '../g-demo/registro.mjs';
import { verificarSoloSintetico } from '../g-demo/solo-sintetico.mjs';
import { depsDelSistema, verificar } from '../g-demo/verificar.mjs';

const TIEMPO_MAXIMO_MS = 30_000;
const REAL = depsDelSistema();
const FECHA = new Date('2026-11-05T12:00:00Z');
const VALIDACION = { preguntas_validadas: 4, preguntas_no_validadas: 6, rotulo: 'x' };

const REPORTE_ALL = {
  configuracion: {
    nombre: 's5-local',
    catalogVersion: 'cat-1',
    corpusRelease: 'corpus-1',
    modelos: { llm: 'llm-x', embeddings: 'emb-x', reranker: 'rer-x', nli: 'nli-x' },
  },
  metricas: {
    completa: {
      recuperacion: {
        total: { recall_at_10: 0.95, mrr: 0.9 },
        es_a_en: { recall_at_10: 0.9 },
        validacion: VALIDACION,
      },
      citas: { precision: 0.97, validacion: VALIDACION },
      sin_evidencia: { exactitud: 1, validacion: VALIDACION },
      fidelidad: { nli: { fidelidad: 0.95 }, validacion: VALIDACION },
    },
  },
};
const REPORTE_OPCIONES = {
  configuracion: { nombre: 's5-opciones-local' },
  metricas: {
    m_10_1: { porcentaje: 1, validacion: VALIDACION },
    m_10_2: { campos_con_termino: 0, validacion: VALIDACION },
  },
};
const E2E_OK = {
  pasos: [
    { paso: 'login', resultado: 'ok' },
    { paso: 'vista de caso', resultado: 'ok' },
  ],
  catalogVersion: 'cat-1',
  corpusRelease: 'corpus-1',
};
const CONTEO_SINTETICO = {
  conteos: {
    'clinical.patient.por_data_origin': {
      sintetico: 14,
      real_anonimizado: 0,
      real_identificado: 0,
    },
  },
};
const BANDERAS_APAGADAS = { REAL_ANONYMIZED_ENABLED: false, REAL_IDENTIFIED_ENABLED: false };

/** Los insumos del gate en memoria; plantilla, metas, métricas y excepciones, los reales del repo. */
async function correr({
  modo = 'real',
  e2e = E2E_OK,
  reportes = [REPORTE_ALL, REPORTE_OPCIONES],
  conteo = CONTEO_SINTETICO,
  banderas = BANDERAS_APAGADAS,
  p95 = ['--p95-e2e-s', '9.5'],
  existentes = [],
} = {}) {
  const insumos = { '/in/e2e.json': e2e, '/in/r0.json': reportes[0], '/in/r1.json': reportes[1] };
  const escritos = {};
  const salidas = [];
  const deps = {
    leerTexto: (ruta) =>
      ruta in insumos
        ? insumos[ruta]
          ? JSON.stringify(insumos[ruta])
          : null
        : REAL.leerTexto(ruta),
    escribirTexto: (ruta, texto) => {
      escritos[ruta] = texto;
    },
    existe: (ruta) => existentes.includes(ruta),
    reloj: () => FECHA,
    salida: (texto) => salidas.push(texto),
  };
  const argv = [
    '--modo',
    modo,
    '--e2e-resultado',
    '/in/e2e.json',
    ...reportes.flatMap((r, i) => (r ? ['--reporte-evaluate', `/in/r${i}.json`] : [])),
    '--conteo-json',
    conteo ? JSON.stringify(conteo) : '',
    '--banderas-json',
    banderas ? JSON.stringify(banderas) : '',
    '--commit',
    'abc123',
    ...p95,
  ];
  const codigo = await verificar(argv, deps);
  const [ruta] = Object.keys(escritos);
  return { codigo, ruta, registro: escritos[ruta] ?? '', salida: salidas.join('\n') };
}

const PATRONES_PROHIBIDOS = [
  /postgres(ql)?:\/\//i,
  /[\w.]+@[\w.]+\.\w+/,
  /password|contraseña/i,
  /BEGIN [A-Z ]*KEY/,
];

describe('verify-g-demo (verificar.mjs)', () => {
  it(
    'escribe en docs/gates y declara G-Demo superado en modo real con todo en verde [US-142 AC-6]',
    { timeout: TIEMPO_MAXIMO_MS },
    async () => {
      const r = await correr();

      expect(r.codigo).toBe(0);
      expect(r.ruta).toBe('docs/gates/G-Demo-2026-11-05.md');
      expect(r.registro).toContain('**Resultado:** G-Demo superado');
      expect(r.registro).toContain('| Commit | abc123 |');
      expect(r.registro).toContain('| `catalogVersion` | cat-1 |');
      expect(r.registro).toContain('| Modelo de NLI | nli-x |');
      expect(r.registro).toContain('Firma: pendiente');
      expect(r.registro).toContain('sintetico=14, real_anonimizado=0, real_identificado=0');
      expect(r.registro).toContain('9.5 s, dentro de la meta');
    },
  );

  it(
    'escribe en reports/gates y no declara G-Demo en modo fingido [US-142 AC-6]',
    { timeout: TIEMPO_MAXIMO_MS },
    async () => {
      const r = await correr({ modo: 'fingido', p95: [] });

      expect(r.codigo).toBe(0);
      expect(r.ruta).toBe('reports/gates/G-Demo-fingido-2026-11-05.md');
      expect(r.registro).toContain(
        'Regresión del recorrido en verde (modo fingido); G-Demo se declara solo en modo real',
      );
      expect(r.registro).not.toContain('**Resultado:** G-Demo superado');
      expect(r.registro).toContain('no medido');
    },
  );

  it(
    'sale con 1 y dice procedencia incompleta cuando falta corpusRelease [US-142 AC-6]',
    { timeout: TIEMPO_MAXIMO_MS },
    async () => {
      const r = await correr({
        e2e: { ...E2E_OK, corpusRelease: undefined },
        reportes: [
          {
            ...REPORTE_ALL,
            configuracion: { ...REPORTE_ALL.configuracion, corpusRelease: undefined },
          },
          REPORTE_OPCIONES,
        ],
      });

      expect(r.codigo).toBe(1);
      expect(r.registro).toContain('| `corpusRelease` | No disponible |');
      expect(r.registro).toContain('G-Demo no superado: procedencia incompleta');
    },
  );

  it(
    'sale con 1 y nombra la métrica cuando M-10.1 no llega al 100 % [US-142 AC-2]',
    { timeout: TIEMPO_MAXIMO_MS },
    async () => {
      const opciones = {
        ...REPORTE_OPCIONES,
        metricas: {
          ...REPORTE_OPCIONES.metricas,
          m_10_1: { porcentaje: 0.96, validacion: VALIDACION },
        },
      };

      const r = await correr({ reportes: [REPORTE_ALL, opciones] });

      expect(r.codigo).toBe(1);
      expect(r.salida).toContain('M-10.1 fuera de meta');
    },
  );

  it(
    'sale con 1 cuando el reporte de evaluate es de otra configuración [US-142 AC-2]',
    { timeout: TIEMPO_MAXIMO_MS },
    async () => {
      const r = await correr({
        reportes: [
          {
            ...REPORTE_ALL,
            configuracion: { ...REPORTE_ALL.configuracion, nombre: 'opciones-fake' },
          },
          null,
        ],
      });

      expect(r.codigo).toBe(1);
      expect(r.salida).toContain('reporte de evaluate ausente o de otra configuración');
    },
  );

  it(
    'sale con 1 y solo muestra el conteo agregado con un paciente no sintético [US-142 AC-3]',
    { timeout: TIEMPO_MAXIMO_MS },
    async () => {
      const conteo = {
        conteos: {
          'clinical.patient.por_data_origin': {
            sintetico: 13,
            real_anonimizado: 1,
            real_identificado: 0,
          },
        },
      };

      const r = await correr({ conteo });

      expect(r.codigo).toBe(1);
      expect(r.salida).toContain('datos no sintéticos');
      expect(r.registro).toContain('sintetico=13, real_anonimizado=1, real_identificado=0');
    },
  );

  it(
    'sale con 1 y nombra la variable cuando una bandera de datos reales está activa [US-142 AC-3]',
    { timeout: TIEMPO_MAXIMO_MS },
    async () => {
      const r = await correr({ banderas: { ...BANDERAS_APAGADAS, REAL_ANONYMIZED_ENABLED: true } });

      expect(r.codigo).toBe(1);
      expect(r.salida).toContain('REAL_ANONYMIZED_ENABLED');
    },
  );

  it(
    'sale con 1 y no da por superado el gate cuando la BD no responde [US-142 AC-3]',
    { timeout: TIEMPO_MAXIMO_MS },
    async () => {
      const r = await correr({ conteo: null });

      expect(r.codigo).toBe(1);
      expect(r.salida).toContain('no se pudo verificar el origen de los datos');
    },
  );

  it(
    'sale con 1 y nombra el paso cuando el E2E falló [US-142 AC-1]',
    { timeout: TIEMPO_MAXIMO_MS },
    async () => {
      const e2e = {
        ...E2E_OK,
        pasos: [
          { paso: 'login', resultado: 'ok' },
          { paso: 'vista de caso', resultado: 'fallo' },
        ],
      };

      const r = await correr({ e2e });

      expect(r.codigo).toBe(1);
      expect(r.salida).toContain('paso fallido: vista de caso');
    },
  );

  it(
    'declara las excepciones y la validación clínica sin contarlas como fallo [US-142 AC-4] [US-142 AC-5]',
    { timeout: TIEMPO_MAXIMO_MS },
    async () => {
      const r = await correr();

      expect(r.registro).toContain('AC-T1.5');
      expect(r.registro).toContain('AC-T3.3');
      expect(r.registro).toContain('VM-1: ');
      expect(r.registro).toContain('se mide en el piloto');
      expect(r.registro).toContain('vm-baseline-protocolo.md');
    },
  );

  it(
    'no emite filas, correos ni cadenas de conexión en la salida ni en el registro [US-142 AC-3]',
    { timeout: TIEMPO_MAXIMO_MS },
    async () => {
      const r = await correr();

      for (const patron of PATRONES_PROHIBIDOS) {
        expect(r.salida).not.toMatch(patron);
        expect(r.registro).not.toMatch(patron);
      }
    },
  );
});

describe('extraerBanderas', () => {
  it('devuelve solo las dos banderas como booleano aunque la configuración traiga secretos [US-142 AC-3]', () => {
    const configuracion = {
      services: {
        'clinical-api': {
          environment: {
            REAL_ANONYMIZED_ENABLED: 'false',
            REAL_IDENTIFIED_ENABLED: 'false',
            DATABASE_URL: ['postgres', '://u:p@h/db'].join(''),
          },
        },
        'clinical-seed': {
          environment: { REAL_ANONYMIZED_ENABLED: 'false', REAL_IDENTIFIED_ENABLED: 'false' },
        },
      },
    };

    const banderas = extraerBanderas(configuracion);

    expect(banderas).toEqual({ REAL_ANONYMIZED_ENABLED: false, REAL_IDENTIFIED_ENABLED: false });
  });

  it('cuenta como activa la bandera que algún servicio no declara apagada [US-142 AC-3]', () => {
    const configuracion = {
      services: {
        'clinical-api': {
          environment: { REAL_ANONYMIZED_ENABLED: 'false', REAL_IDENTIFIED_ENABLED: 'false' },
        },
        'clinical-seed': {
          environment: { REAL_ANONYMIZED_ENABLED: 'true', REAL_IDENTIFIED_ENABLED: 'false' },
        },
      },
    };

    expect(extraerBanderas(configuracion)).toEqual({
      REAL_ANONYMIZED_ENABLED: true,
      REAL_IDENTIFIED_ENABLED: false,
    });
  });

  it('cuenta ambas como activas cuando no hay configuración legible [US-142 AC-3]', () => {
    expect(extraerBanderas({})).toEqual({
      REAL_ANONYMIZED_ENABLED: true,
      REAL_IDENTIFIED_ENABLED: true,
    });
  });
});

describe('metricas.json', () => {
  it('apunta solo a claves que existen en metas-iniciales.yaml y no trae metas escritas salvo las dos invariantes [RN-22]', () => {
    const metas = cargarMetas(
      REAL.leerTexto('apps/rag-orchestrator/eval/configs/metas-iniciales.yaml'),
    );
    const { definiciones, p95 } = JSON.parse(REAL.leerTexto('scripts/gates/g-demo/metricas.json'));

    for (const d of definiciones.filter((x) => x.claveMeta))
      expect(Object.keys(metas)).toContain(d.claveMeta);
    expect(definiciones.filter((x) => x.metaFija).map((x) => x.id)).toEqual(['M-10.1', 'M-10.2']);
    expect(Object.keys(metas)).toContain(p95.claveMeta);
  });
});

describe('registro real ya existente', () => {
  it('no sobrescribe un registro real que puede estar firmado [US-142 AC-6]', async () => {
    await expect(correr({ existentes: ['docs/gates/G-Demo-2026-11-05.md'] })).rejects.toThrow(
      /no se sobrescribe/,
    );
  });
});

describe('verificarSoloSintetico con un origen desconocido', () => {
  it('falla con datos no sintéticos cuando aparece un origen nuevo con pacientes [US-142 AC-3]', () => {
    const r = verificarSoloSintetico({ sintetico: 14, real_nuevo: 1 }, BANDERAS_APAGADAS);

    expect(r.ok).toBe(false);
    expect(r.motivos).toContain('datos no sintéticos');
  });
});

describe('renderizarRegistro', () => {
  it('falla cuando la plantilla pide un dato que no hay', () => {
    expect(() => renderizarRegistro('hola {{nombre}}', {})).toThrow(/nombre/);
  });

  it('sustituye cada marcador por su dato', () => {
    expect(renderizarRegistro('{{a}}-{{b}}', { a: 1, b: 'x' })).toBe('1-x');
  });
});
