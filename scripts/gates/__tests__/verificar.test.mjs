import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CLAVE_PACIENTES_POR_ORIGEN,
  contarPacientesPorOrigen,
} from '../../../apps/clinical-api/prisma/seed/contar.ts';
import { extraerBanderas } from '../g-demo/banderas.mjs';
import { cargarMetas } from '../g-demo/metricas.mjs';
import { renderizarRegistro } from '../g-demo/registro.mjs';
import { verificarSoloSintetico } from '../g-demo/solo-sintetico.mjs';
import {
  ARGUMENTO_REPETIBLE,
  CLAVES_DE_ARGUMENTOS,
  depsDelSistema,
  leerArgumentos,
  verificar,
} from '../g-demo/verificar.mjs';

const TIEMPO_MAXIMO_MS = 30_000;
const REAL = depsDelSistema();
const FECHA = new Date('2026-11-05T12:00:00Z');
const VALIDACION = { preguntas_validadas: 4, preguntas_no_validadas: 6, rotulo: 'x' };

const REPORTE_ALL = {
  configuracion: {
    nombre: 's5-opciones-local',
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
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const RUTA_METAS = 'apps/rag-orchestrator/eval/configs/metas-iniciales.yaml';
// Metas inyectadas con valores distintos de los reales: el gate lee lo que se le pasa (RN-22).
const METAS_INYECTADAS = [
  'metas:',
  ...[
    'recall_at_10',
    'recall_at_10_es_a_en',
    'mrr',
    'fidelidad_proxy',
    'precision_citas',
    'sin_evidencia',
  ].map((clave) => `  ${clave}: {etiqueta: ${clave}, minimo: 0.1}`),
  '  p95_evidence_analyses_s: {etiqueta: p95, maximo: 20}',
].join('\n');
const E2E_OK = {
  modoLlm: 'real',
  generadoEn: '2026-11-05T10:00:00Z',
  pasos: [
    { paso: 'login', resultado: 'ok' },
    { paso: 'vista de caso', resultado: 'ok' },
  ],
  catalogVersion: 'cat-1',
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
  p95 = ['--p95-baseline-s', '9.5'],
  existentes = [],
  commit = COMMIT,
  extra = [],
} = {}) {
  const insumos = { '/in/e2e.json': e2e, '/in/r0.json': reportes[0], '/in/r1.json': reportes[1] };
  const escritos = {};
  const salidas = [];
  const deps = {
    leerTexto: (ruta) => (ruta === RUTA_METAS ? METAS_INYECTADAS : REAL.leerTexto(ruta)),
    leerTextoOpcional: (ruta) => (insumos[ruta] ? JSON.stringify(insumos[ruta]) : null),
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
    commit,
    ...p95,
    ...extra,
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
      expect(r.registro).toContain(
        '**Resultado:** G-Demo superado (criterios técnicos del MVP sobre datos sintéticos; la utilidad clínica no se valida aquí)',
      );
      expect(r.registro).toContain(`| Commit | ${COMMIT} |`);
      expect(r.registro).toContain('| `catalogVersion` | cat-1 |');
      expect(r.registro).toContain('| Modelo de NLI | nli-x |');
      expect(r.registro).toContain('Firma: pendiente');
      expect(r.registro).toContain('sintetico=14, real_anonimizado=0, real_identificado=0');
      expect(r.registro).toContain('9.5 s, dentro de la meta');
      expect(r.registro).toContain(
        'Análisis generado por IA; requiere validación clínica independiente por el oncólogo tratante (RN-19).',
      );
    },
  );

  it(
    'escribe en reports/gates y no declara G-Demo en modo fingido [US-142 AC-6]',
    { timeout: TIEMPO_MAXIMO_MS },
    async () => {
      const r = await correr({ modo: 'fingido', e2e: { ...E2E_OK, modoLlm: 'fingido' }, p95: [] });

      expect(r.codigo).toBe(0);
      expect(r.ruta).toBe('reports/gates/G-Demo-fingido-2026-11-05.md');
      expect(r.registro).toContain(
        'Regresión del recorrido en verde (modo fingido); G-Demo se declara solo en modo real',
      );
      expect(r.registro).not.toContain('**Resultado:** G-Demo superado');
      expect(r.registro).toContain('no medida');
    },
  );

  it(
    'sale con 1 y dice procedencia incompleta cuando falta corpusRelease [US-142 AC-6]',
    { timeout: TIEMPO_MAXIMO_MS },
    async () => {
      const r = await correr({
        e2e: E2E_OK,
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

describe('verify-g-demo: modo y destino del registro', () => {
  it('sale con 1 cuando --modo real y el E2E declara modo fingido [US-142 AC-6]', async () => {
    const r = await correr({ modo: 'real', e2e: { ...E2E_OK, modoLlm: 'fingido' } });

    expect(r.codigo).toBe(1);
    expect(r.salida).toContain('modo');
  });

  it('escribe en reports/gates cuando el modo real no se supera [US-142 AC-6]', async () => {
    const r = await correr({
      modo: 'real',
      banderas: { ...BANDERAS_APAGADAS, REAL_IDENTIFIED_ENABLED: true },
    });

    expect(r.codigo).toBe(1);
    expect(r.ruta).toMatch(/^reports\/gates\//);
    expect(r.registro).toContain('G-Demo no superado');
  });

  it('no declara p95 en modo fingido aunque llegue un valor [US-142 AC-7]', async () => {
    const r = await correr({ modo: 'fingido', e2e: { ...E2E_OK, modoLlm: 'fingido' } });

    expect(r.registro).toContain('no medida');
  });
});

describe('verify-g-demo: entradas hostiles', () => {
  it('rechaza un argumento desconocido con un mensaje fijo, sin repetirlo [US-142 AC-3]', () => {
    const secreto = ['--clave', 'valor-secreto-sintetico'];

    expect(() => leerArgumentos(secreto)).toThrow(/argumento desconocido/);
    expect(() => leerArgumentos(secreto)).not.toThrow(/clave|secreto/);
  });

  it('rechaza una clave duplicada para que un duplicado no falsifique el conteo [US-142 AC-3] [RN-13]', () => {
    expect(() => leerArgumentos(['--conteo-json', '{"a":1}', '--conteo-json', '{"b":2}'])).toThrow(
      /duplicad/,
    );
    expect(leerArgumentos(['--reporte-evaluate', 'a', '--reporte-evaluate', 'b']).reportes).toEqual(
      ['a', 'b'],
    );
  });

  it('el wrapper no acepta --conteo-json, --banderas-json ni --commit desde los argumentos [US-142 AC-3] [RN-13]', () => {
    const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

    const r = spawnSync(
      'bash',
      [path.join(raiz, 'scripts/verify-g-demo'), '--modo', 'real', '--conteo-json', '{}'],
      {
        encoding: 'utf8',
        timeout: TIEMPO_MAXIMO_MS,
      },
    );

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('no se acepta');
    expect(r.stderr).not.toContain('{}');
  });

  it.each([
    ['commit', { commit: 'abc; rm -rf /' }, /\| Commit \| No disponible \|/],
    ['commit corto', { commit: 'abc123' }, /\| Commit \| No disponible \|/],
    [
      'modelo',
      {
        reportes: [
          {
            ...REPORTE_ALL,
            configuracion: {
              ...REPORTE_ALL.configuracion,
              modelos: { ...REPORTE_ALL.configuracion.modelos, llm: 'texto libre con espacios' },
            },
          },
          REPORTE_OPCIONES,
        ],
      },
      /\| Modelo de generación \| No disponible \|/,
    ],
    ['consultas', { extra: ['--p95-consultas', 'diez'] }, /consultas: No disponible/],
  ])(
    'escribe No disponible cuando el %s no cumple la lista blanca [US-142 AC-6]',
    async (_, opciones, esperado) => {
      const r = await correr(opciones);

      expect(r.registro).toMatch(esperado);
    },
  );

  describe('modelos con la cadena «<modelo>@<revisión>#sha256:<hash>» (D5-55)', () => {
    const HASH = 'a'.repeat(64);
    const cadena = (modelo) => `${modelo}@rev-1#sha256:${HASH}`;
    const reporteConModelos = (modelos) => ({
      ...REPORTE_OPCIONES,
      configuracion: { ...REPORTE_OPCIONES.configuracion, modelos },
    });

    it('copia al registro los modelos de embeddings, reranker y NLI cuando traen revisión y sha256', async () => {
      const r = await correr({
        reportes: [
          reporteConModelos({
            llm: 'gemma4:e4b',
            embeddings: cadena('BAAI/bge-m3'),
            reranker: cadena('BAAI/bge-reranker-v2-m3'),
            nli: cadena('MoritzLaurer/mDeBERTa-v3-base-xnli'),
          }),
        ],
      });

      expect(r.registro).toContain(`| Modelo de embeddings | ${cadena('BAAI/bge-m3')} |`);
      expect(r.registro).toContain(`| Modelo de reranker | ${cadena('BAAI/bge-reranker-v2-m3')} |`);
      expect(r.registro).toMatch(/\| Modelo de NLI \| \S+#sha256:a{64} \|/);
    });

    it('sigue escribiendo No disponible cuando el sha256 no es hexadecimal de 64 caracteres', async () => {
      const r = await correr({
        reportes: [
          reporteConModelos({ llm: 'gemma4:e4b', embeddings: 'BAAI/bge-m3@rev-1#sha256:xyz' }),
        ],
      });

      expect(r.registro).toContain('| Modelo de embeddings | No disponible |');
    });

    it('sigue escribiendo No disponible cuando la cadena trae texto libre tras el sha256', async () => {
      const r = await correr({
        reportes: [
          reporteConModelos({
            llm: 'gemma4:e4b',
            embeddings: `${cadena('BAAI/bge-m3')} texto libre`,
          }),
        ],
      });

      expect(r.registro).toContain('| Modelo de embeddings | No disponible |');
    });

    it('completa los modelos desde otro reporte cuando el primero solo trae el LLM (reportes históricos)', async () => {
      const r = await correr({
        reportes: [
          reporteConModelos({ llm: 'gemma4:e4b' }),
          reporteConModelos({ embeddings: cadena('BAAI/bge-m3') }),
        ],
      });

      expect(r.registro).toContain('| Modelo de generación | gemma4:e4b |');
      expect(r.registro).toContain(`| Modelo de embeddings | ${cadena('BAAI/bge-m3')} |`);
    });
  });

  it('cuenta como procedencia incompleta una versión con caracteres fuera de la lista blanca [US-142 AC-6]', async () => {
    const r = await correr({ e2e: { ...E2E_OK, catalogVersion: 'cat 1; texto libre' } });

    expect(r.codigo).toBe(1);
    expect(r.registro).toContain('| `catalogVersion` | No disponible |');
  });
});

describe('contrato entre contar-en-proceso y verify-g-demo', () => {
  it('lee el conteo por origen con la clave que escribe el contador del seed [US-142 AC-3]', async () => {
    const dbFalsa = {
      query: async () => ({ rows: [{ origen: 'sintetico', n: 14 }], rowCount: 1 }),
    };
    const salidaDelContador = {
      conteos: {
        'clinical.patient': 14,
        [CLAVE_PACIENTES_POR_ORIGEN]: await contarPacientesPorOrigen(dbFalsa),
      },
    };

    const r = await correr({ conteo: salidaDelContador });

    expect(r.codigo).toBe(0);
    expect(r.registro).toContain('sintetico=14, real_anonimizado=0, real_identificado=0');
  });
});

describe('depsDelSistema', () => {
  it('lanza con la ruta cuando falta un fichero obligatorio y devuelve null en el opcional [US-142 AC-6]', () => {
    const deps = depsDelSistema();

    expect(() => deps.leerTexto('no/existe.json')).toThrow(/no\/existe\.json/);
    expect(deps.leerTextoOpcional('no/existe.json')).toBeNull();
  });
});

describe('higiene de docs/gates', () => {
  it('no deja en el árbol ningún registro G-Demo no superado en docs/gates [US-142 AC-6]', () => {
    const carpeta = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../docs/gates',
    );
    const registros = readdirSync(carpeta).filter((f) => /^G-Demo-.*\.md$/.test(f));

    for (const registro of registros) {
      expect(readFileSync(path.join(carpeta, registro), 'utf8'), registro).not.toContain(
        'G-Demo no superado',
      );
    }
  });
});

describe('guía de la Demo 5', () => {
  const guia = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../docs/demo/guia-demo-S5.md',
    ),
    'utf8',
  );

  it('usa en el comando de verify-g-demo solo flags que el script acepta [US-142 AC-6]', () => {
    const linea = guia.split('\n').find((l) => l.includes('scripts/verify-g-demo --modo'));
    const aceptados = [...Object.keys(CLAVES_DE_ARGUMENTOS), ARGUMENTO_REPETIBLE];

    for (const flag of linea.match(/--[a-z0-9-]+/g)) expect(aceptados).toContain(flag);
  });

  it('deja --p95-e2e-s para evaluate y --p95-baseline-s solo para verify-g-demo [US-142 AC-7]', () => {
    const paso = guia.split('\n').find((l) => l.startsWith('2. Corrida de `evaluate`'));
    const bloque = guia.slice(guia.indexOf(paso), guia.indexOf('3. E2E `g-demo.spec.ts`'));

    expect(bloque).toContain('--p95-e2e-s');
    expect(bloque).not.toContain('--p95-baseline-s');
  });
});

describe('verify-g-demo: reportes ilegibles y avisos', () => {
  it('sale con 1 cuando un --reporte-evaluate declarado no se puede leer [US-142 AC-2]', async () => {
    const r = await correr({ extra: ['--reporte-evaluate', '/in/inexistente.json'] });

    expect(r.codigo).toBe(1);
    expect(r.salida).toContain('reporte de evaluate ilegible');
  });

  it('muestra en el registro fingido el aviso de RN-28 no verificable sin bloquear [US-142 AC-1]', async () => {
    const e2e = {
      ...E2E_OK,
      modoLlm: 'fingido',
      pasos: [
        { paso: 'login', resultado: 'ok' },
        { paso: 'orden RN-28', resultado: 'no_verificable' },
      ],
    };

    const r = await correr({ modo: 'fingido', e2e });

    expect(r.codigo).toBe(0);
    expect(r.registro).toContain('RN-28 no verificable con 1 opción: orden RN-28');
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
