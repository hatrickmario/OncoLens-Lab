import type {
  ClinicalAttribute,
  ClinicalAttributeList,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import {
  esDeclaracionDeAusencia,
  exigirSinTratamientosParaDeclarar,
} from '../compartido/declaracion-de-ausencia.js';
import { exigirPacienteQueAdmiteRegistros } from '../compartido/paciente-activo.js';
import { PacienteNoEncontradoError } from '../compartido/pacientes.errores.js';
import {
  armarAtributoManual,
  comoAtributoDelContrato,
  comoAtributoLeido,
  comoListaDeAtributos,
} from './clinical-attributes.atributo.js';
import { TipoDeCancerNoRegistradoError } from './clinical-attributes.errores.js';
import { exigirAtributoPermitido } from './clinical-attributes.reglas.js';
import type { CuerpoDeAtributo } from './clinical-attributes.schema.js';
import type { CatalogoDeAtributos, RepositorioDeAtributos } from './ports.js';

export interface SolicitudDeAtributo {
  readonly patientId: string;
  readonly cuerpo: CuerpoDeAtributo;
}

export interface ClinicalAttributesService {
  registrarAtributo(solicitud: SolicitudDeAtributo): Promise<ClinicalAttribute>;
  listarAtributos(patientId: string): Promise<ClinicalAttributeList>;
}

export interface DependenciasDelService {
  readonly repositorio: RepositorioDeAtributos;
  readonly catalogo: CatalogoDeAtributos;
  readonly reloj: Clock;
  readonly generarId: GeneradorDeIds;
}

export function createClinicalAttributesService(
  dependencias: DependenciasDelService,
): ClinicalAttributesService {
  const { repositorio, catalogo, reloj, generarId } = dependencias;
  return {
    registrarAtributo: ({ patientId, cuerpo }) =>
      repositorio.enTransaccion(async (tx) => {
        await exigirPacienteQueAdmiteRegistros(tx, patientId);
        // Sin diagnóstico vigente no hay tipo de cáncer contra el que validar (RN-29): no se puede registrar.
        const tipoDeCancer = await tx.tipoDeCancerVigente(patientId);
        if (tipoDeCancer === null) throw new TipoDeCancerNoRegistradoError();
        exigirAtributoPermitido(catalogo.atributosPermitidos(tipoDeCancer), cuerpo);
        // Una sola verdad (d5fb-04 D4): no se declara la ausencia de lo que ya está registrado.
        if (esDeclaracionDeAusencia(cuerpo.attributeKey)) {
          await exigirSinTratamientosParaDeclarar(tx, patientId);
        }
        const atributo = armarAtributoManual({
          cuerpo,
          patientId,
          episodeId: await tx.episodioDelRegistro(patientId),
          ahora: reloj.now(),
          generarId,
        });
        await tx.guardarAtributo(atributo);
        return comoAtributoDelContrato(comoAtributoLeido(atributo));
      }),
    listarAtributos: (patientId) =>
      repositorio.enTransaccion(async (tx) => {
        if (!(await tx.existePaciente(patientId))) throw new PacienteNoEncontradoError();
        const tipoDeCancer = await tx.tipoDeCancerVigente(patientId);
        const permitidos = tipoDeCancer === null ? [] : catalogo.atributosPermitidos(tipoDeCancer);
        return comoListaDeAtributos(
          await tx.atributosVigentes(patientId),
          permitidos,
          catalogo.version(),
        );
      }),
  };
}
