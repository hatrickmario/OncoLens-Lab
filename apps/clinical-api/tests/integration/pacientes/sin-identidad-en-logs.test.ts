import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearPacienteFxT4aA } from '../../support/gateway.js';
import { FX_T4A_A, servicioDeIdentidad } from '../../support/identidad.js';
import {
  capturarSalidaDelProceso,
  ejecutarArnesDeNoFuga,
  valoresDeIdentidad,
  type Fuente,
  type PasoDeNoFuga,
} from '../../support/no-fuga.js';
import {
  iniciarEscenarioDePacientes,
  montarPacientes,
  type EscenarioDePacientes,
} from '../../support/pacientes.js';
import { loggerEnMemoria } from '../../support/usuarios.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 2024;
const URL_DE_LA_BUSQUEDA = '/platform/patients/search';
let escenario: EscenarioDePacientes;
let idDeFx: string;

beforeAll(async () => {
  escenario = await iniciarEscenarioDePacientes('pac_sin_fuga', ESPACIO_DE_IDS);
  idDeFx = await crearPacienteFxT4aA(escenario.mundo, servicioDeIdentidad(escenario.mundo.cliente));
});
afterAll(() => escenario.cerrar());

describe('la identidad no aparece en URLs ni en logs', () => {
  it('no deja el documento, el nombre ni los índices ciegos en ninguna URL ni log tras buscar por documento y por nombre [US-048 AC-5]', async () => {
    const logger = loggerEnMemoria();
    const { app: aplicacion } = montarPacientes(escenario.mundo, { logger });
    // La URL REAL de cada petición, capturada por un middleware de test antes de que llegue a la aplicación.
    const urlsPedidas: string[] = [];
    const app = express();
    app.use((request, _response, next) => {
      urlsPedidas.push(request.originalUrl);
      next();
    });
    app.use(aplicacion);
    const buscar = async (cuerpo: object): Promise<void> => {
      const respuesta = await clienteVerificado(app)
        .post(URL_DE_LA_BUSQUEDA)
        .set('Cookie', escenario.cookieDoctor)
        .send(cuerpo);
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.items.map((elemento: { id: string }) => elemento.id)).toEqual([idDeFx]);
    };
    const pasos: PasoDeNoFuga[] = [
      {
        nombre: 'buscar por documento',
        ejecutar: () => buscar({ idType: FX_T4A_A.idType, nationalId: FX_T4A_A.numeroDeDocumento }),
      },
      {
        nombre: 'buscar por nombre',
        ejecutar: () => buscar({ name: FX_T4A_A.nombreNormalizado }),
      },
    ];

    const { salida, restaurar } = capturarSalidaDelProceso();
    let hallazgos: Awaited<ReturnType<typeof ejecutarArnesDeNoFuga>>;
    try {
      hallazgos = await ejecutarArnesDeNoFuga({
        pasos,
        valores: async () => {
          const guardada = await servicioDeIdentidad(escenario.mundo.cliente).descifrar(idDeFx);
          if (guardada === null) throw new Error('la identidad de FX-T4a-a no quedó guardada');
          const { rows } = await escenario.mundo.cliente.query<Record<string, string>>(
            'SELECT national_id_hmac, full_name_hmac FROM identity.patient_identity WHERE patient_id = $1',
            [idDeFx],
          );
          return [...valoresDeIdentidad(guardada), ...Object.values(rows[0] ?? {})];
        },
        fuentes: (): Promise<Fuente[]> =>
          Promise.resolve([
            ...logger.lineas.map((linea, indice) => ({
              nombre: `log:clinical-api[${indice}]`,
              texto: JSON.stringify(linea),
            })),
            ...salida.map((texto, indice) => ({ nombre: `salida:proceso[${indice}]`, texto })),
            ...urlsPedidas.map((url, indice) => ({
              nombre: `url:clinical-api[${indice}]`,
              texto: url,
            })),
          ]),
      });
    } finally {
      restaurar();
    }

    expect(urlsPedidas).toEqual([URL_DE_LA_BUSQUEDA, URL_DE_LA_BUSQUEDA]);
    expect(hallazgos).toEqual([]);
    expect(logger.lineas.filter((linea) => linea['event'] === 'patients.busqueda')).toHaveLength(2);
  });
});
