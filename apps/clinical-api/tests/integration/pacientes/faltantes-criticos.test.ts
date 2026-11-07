import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idSembrado } from '../../../prisma/seed/determinismo.js';
import { PACIENTES_SEMILLA } from '../../../prisma/seed/pacientes/indice.js';
import type { Consultador } from '../../../src/modules/auth/auth.repository.js';
import type {
  CompletenessEnLote,
  CompletenessService,
} from '../../../src/modules/completeness/ports.js';
import { crearTiposHabilitados } from '../../../src/modules/evidence-analysis/tipos-habilitados.js';
import { createFichaRepository } from '../../../src/modules/patients/ficha.repository.js';
import { createPatientsRepository } from '../../../src/modules/patients/patients.repository.js';
import { componerModuloDeOptOuts } from '../../../src/modules/opt-outs/opt-outs.module.js';
import { crearPatientsService } from '../../../src/modules/patients/patients.service.js';
import { servicioDeCompletitud } from '../../support/completitud-http.js';
import { FX_T4A_A, servicioDeIdentidad } from '../../support/identidad.js';
import {
  iniciarEscenarioDePacientes,
  montarPacientes,
  type EscenarioDePacientes,
  type OpcionesDePacientes,
} from '../../support/pacientes.js';
import { RUTA_DEL_CATALOGO } from '../../support/seed.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 2040;
const TODOS = PACIENTES_SEMILLA.length;
const ERROR_DE_PG = 'connection refused (SINT-error-de-pg)';
const PETICION_DE_BUSQUEDA = { idType: FX_T4A_A.idType, nationalId: FX_T4A_A.numeroDeDocumento };

interface Fila {
  id: string;
  cancerTypeEnabled: boolean;
  missingCriticalCount: number;
  completenessAvailable?: boolean;
}

let escenario: EscenarioDePacientes;

beforeAll(async () => {
  escenario = await iniciarEscenarioDePacientes('pac_faltantes', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

const idsDeSemilla = (tipo: 'mama' | 'prostata'): string[] =>
  PACIENTES_SEMILLA.filter((p) =>
    p.diagnosticos.some((d) => d.activo && d.cancerType === tipo),
  ).map((p) => idSembrado(p.clave));

function completitud(db: Consultador = escenario.mundo.cliente) {
  return servicioDeCompletitud({ cliente: db }, { rutaDelCatalogo: RUTA_DEL_CATALOGO });
}

/** El servicio real con el lote sustituido (es un puerto: el borde donde se inyecta el fallo). */
function conLote(lote: CompletenessEnLote['calcularVarios']) {
  return { calcular: completitud().calcular, calcularVarios: lote };
}

const listar = (app: ReturnType<typeof montarPacientes>['app'], cookie = escenario.cookieDoctor) =>
  clienteVerificado(app).get('/platform/patients').set('Cookie', cookie);

/** `POST /search` con la búsqueda por documento resuelta a `ids` (el índice ciego no es lo que se prueba aquí). */
function buscarIds(ids: string[], opciones: OpcionesDePacientes = {}) {
  const identidad = {
    ...servicioDeIdentidad(escenario.mundo.cliente),
    buscarPorDocumento: async () => ids,
  };
  const montado = montarPacientes(escenario.mundo, { pageSize: TODOS, identidad, ...opciones });
  return {
    ...montado,
    respuesta: (cookie = escenario.cookieDoctor) =>
      clienteVerificado(montado.app)
        .post('/platform/patients/search')
        .set('Cookie', cookie)
        .send(PETICION_DE_BUSQUEDA),
  };
}

describe.each([[['mama', 'prostata']], [['mama']]])(
  'listado con ENABLED_CANCER_TYPES=%s',
  (habilitados) => {
    it('muestra al menos 2 pacientes con faltantes y cada contador iguala al de su ficha [US-003 AC-2] [FR-23]', async () => {
      const { app } = montarPacientes(escenario.mundo, { pageSize: TODOS, habilitados });

      const pagina = await listar(app);
      const filas = pagina.body.items as Fila[];
      const fichas = await Promise.all(
        filas.map((fila) =>
          clienteVerificado(app)
            .get(`/platform/patients/${fila.id}`)
            .set('Cookie', escenario.cookieDoctor),
        ),
      );

      expect(pagina.status).toBe(200);
      expect(filas.filter((fila) => fila.missingCriticalCount > 0).length).toBeGreaterThanOrEqual(
        2,
      );
      filas.forEach((fila, i) => {
        expect(fichas[i]?.body.missingCriticalCount).toBe(fila.missingCriticalCount);
      });
      const sinTipoHabilitado = filas.filter((fila) => !fila.cancerTypeEnabled);
      expect(sinTipoHabilitado).toHaveLength(habilitados.includes('prostata') ? 0 : 3);
      for (const fila of sinTipoHabilitado) {
        expect(fila.missingCriticalCount).toBe(0);
        expect(fila).not.toHaveProperty('completenessAvailable');
      }
    });
  },
);

describe('búsqueda y listado', () => {
  it('devuelve en la búsqueda el mismo contador que en el listado [FR-02] [FR-23]', async () => {
    const { app } = montarPacientes(escenario.mundo, { pageSize: TODOS });
    const enListado = new Map(
      ((await listar(app)).body.items as Fila[]).map((f) => [f.id, f.missingCriticalCount]),
    );
    const ids = [...enListado].filter(([, n]) => n > 0).map(([id]) => id);

    const { respuesta } = buscarIds(ids);
    const encontrados = (await respuesta()).body.items as Fila[];

    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(encontrados.map((f) => [f.id, f.missingCriticalCount]).sort()).toEqual(
      ids.map((id) => [id, enListado.get(id)]).sort(),
    );
  });

  it('hace el mismo número de consultas de completitud con una página de 1 paciente que con una de todos los de mama [NFR listado p95 ≤ 1 s]', async () => {
    const mama = idsDeSemilla('mama');
    const consultasCon = async (tamano: number): Promise<number> => {
      let consultas = 0;
      const contador: Consultador = {
        query: (sql, valores) => {
          consultas += 1;
          return escenario.mundo.cliente.query(sql, valores);
        },
      };
      const { respuesta } = buscarIds(mama, {
        pageSize: tamano,
        completitud: completitud(contador),
      });
      expect((await respuesta()).status).toBe(200);
      return consultas;
    };

    const conUno = await consultasCon(1);
    const conTodos = await consultasCon(mama.length);

    expect(mama.length).toBeGreaterThan(3);
    expect(conUno).toBeGreaterThan(0);
    expect(conTodos).toBe(conUno);
  });
});

describe('degradación del cálculo (RN-26)', () => {
  it('responde 200 con 0 y completenessAvailable false solo en la fila del paciente que falla [RN-26]', async () => {
    const [fallido] = idsDeSemilla('mama');
    const real = completitud();
    const servicio = conLote(async (ids) => {
      const resultados = new Map(await real.calcularVarios(ids));
      resultados.set(fallido as string, { estado: 'no_disponible', error: new Error(ERROR_DE_PG) });
      return resultados;
    });
    const { app, logger } = montarPacientes(escenario.mundo, {
      pageSize: TODOS,
      completitud: servicio,
    });

    const respuesta = await listar(app);

    const filas = respuesta.body.items as Fila[];
    expect(respuesta.status).toBe(200);
    expect(filas).toHaveLength(TODOS);
    expect(filas.find((f) => f.id === fallido)).toMatchObject({
      missingCriticalCount: 0,
      completenessAvailable: false,
    });
    expect(filas.filter((f) => f.completenessAvailable === false)).toHaveLength(1);
    expect(filas.filter((f) => f.missingCriticalCount > 0).length).toBeGreaterThanOrEqual(2);
    expect(logger.texto()).not.toContain('SINT-error-de-pg');
  });

  it('marca todas las filas «no disponible» y registra solo la clase del error cuando falla el lote entero [RN-26] [RN-10]', async () => {
    class ErrorDeLoteSintetico extends Error {
      constructor() {
        super(ERROR_DE_PG);
        this.name = 'ErrorDeLoteSintetico';
      }
    }
    const servicio = conLote(() => Promise.reject(new ErrorDeLoteSintetico()));
    const listado = montarPacientes(escenario.mundo, { pageSize: TODOS, completitud: servicio });
    const busqueda = buscarIds(idsDeSemilla('mama'), { completitud: servicio });

    const enListado = await listar(listado.app);
    const enBusqueda = await busqueda.respuesta();

    for (const respuesta of [enListado, enBusqueda]) {
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.items.length).toBeGreaterThan(0);
      for (const fila of respuesta.body.items as Fila[]) {
        expect(fila).toMatchObject({ missingCriticalCount: 0, completenessAvailable: false });
      }
    }
    const aviso = listado.logger.lineas.find(
      (l) => l.event === 'patients.listado.checklist_no_disponible',
    );
    expect(aviso?.errorClase).toBe('ErrorDeLoteSintetico');
    expect(Object.keys(aviso ?? {}).sort()).toEqual([
      'errorClase',
      'event',
      'pacientes',
      'resultado',
      'traceId',
    ]);
    expect(
      busqueda.logger.lineas.some((l) => l.event === 'patients.busqueda.checklist_no_disponible'),
    ).toBe(true);
    expect(listado.logger.texto()).not.toContain('SINT-error-de-pg');
  });
});

describe('forma degradada y avisos (RN-26)', () => {
  it('da a la fila del listado la misma forma degradada que a la ficha cuando el cálculo falla [RN-26]', async () => {
    const [paciente] = idsDeSemilla('mama');
    const fallido = {
      calcular: () => Promise.reject(new Error(ERROR_DE_PG)),
      calcularVarios: () => Promise.reject(new Error(ERROR_DE_PG)),
    };
    const { app } = montarPacientes(escenario.mundo, { pageSize: TODOS, completitud: fallido });

    const fila = ((await listar(app)).body.items as Fila[]).find((f) => f.id === paciente);
    const ficha = await clienteVerificado(app)
      .get(`/platform/patients/${paciente}`)
      .set('Cookie', escenario.cookieDoctor);

    expect({
      missingCriticalCount: fila?.missingCriticalCount,
      completenessAvailable: fila?.completenessAvailable,
    }).toEqual({
      missingCriticalCount: ficha.body.missingCriticalCount,
      completenessAvailable: ficha.body.completenessAvailable,
    });
    expect(ficha.body.completenessAvailable).toBe(false);
  });

  it('devuelve la página completa y avisa una sola vez por paciente cuando el callback de aviso lanza [RN-26]', async () => {
    const cliente = escenario.mundo.cliente;
    const servicio = crearPatientsService({
      repo: createPatientsRepository(cliente),
      ficha: createFichaRepository(cliente),
      identidad: servicioDeIdentidad(cliente),
      tiposHabilitados: crearTiposHabilitados(['mama', 'prostata'], ['mama', 'prostata']),
      completitud: conLote(() => Promise.reject(new Error(ERROR_DE_PG))),
      pageSize: TODOS,
      optOuts: componerModuloDeOptOuts({ db: cliente, registrar: () => undefined }).optOuts,
    });
    let avisos = 0;

    const pagina = await servicio.listar({
      filtros: { page: 1 },
      vista: 'doctor_listado',
      alFallarElChecklist: () => {
        avisos += 1;
        throw new Error('aviso roto');
      },
    });

    expect(pagina.items).toHaveLength(TODOS);
    expect(avisos).toBe(TODOS);
  });
});

describe('administrador', () => {
  it('no invoca el servicio de completitud en el listado ni en la búsqueda y devuelve PatientAdminSummary [PRD §11] [US-048 AC-7]', async () => {
    let invocaciones = 0;
    const real = completitud();
    const contado: CompletenessService & CompletenessEnLote = {
      calcular: (id) => {
        invocaciones += 1;
        return real.calcular(id);
      },
      calcularVarios: (ids) => {
        invocaciones += 1;
        return real.calcularVarios(ids);
      },
    };
    const { app } = montarPacientes(escenario.mundo, { pageSize: TODOS, completitud: contado });
    const busqueda = buscarIds(idsDeSemilla('mama'), { completitud: contado });

    const enListado = await listar(app, escenario.cookieAdmin);
    const enBusqueda = await busqueda.respuesta(escenario.cookieAdmin);

    for (const respuesta of [enListado, enBusqueda]) {
      expect(respuesta.status).toBe(200);
      for (const elemento of respuesta.body.items) {
        expect(elemento.view).toBe('admin');
        expect(elemento).not.toHaveProperty('missingCriticalCount');
        expect(elemento).not.toHaveProperty('completenessAvailable');
      }
    }
    expect(invocaciones).toBe(0);
  });
});

describe('paciente sin diagnóstico activo', () => {
  it('muestra 0 sin completenessAvailable false cuando no tiene diagnóstico activo [FR-23]', async () => {
    const [paciente] = idsDeSemilla('mama');
    await escenario.mundo.cliente.query(
      'UPDATE clinical.diagnosis SET is_active = false WHERE patient_id = $1',
      [paciente],
    );
    const { app } = montarPacientes(escenario.mundo, { pageSize: TODOS });

    const fila = ((await listar(app)).body.items as Fila[]).find((f) => f.id === paciente);

    expect(fila?.missingCriticalCount).toBe(0);
    expect(fila).not.toHaveProperty('completenessAvailable');
  });
});
