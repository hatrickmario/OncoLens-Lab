import type { AnalysisBasis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes, rellenar } from '../mensajes';
import type { EstadoDelAnalisis } from './estado-del-analisis';

type FuentesConsultadas = AnalysisBasis['sourcesConsulted'];

function nombrarFiltros(filtros: FuentesConsultadas['filters']): string {
  const { filtros: textos, ninguno } = mensajes().evidence.base;
  const activos = [
    filtros.historiaCompleta && textos.historiaCompleta,
    filtros.soloBiomarcadoresRelevantes && textos.soloBiomarcadoresRelevantes,
    filtros.ultimosSeisMeses && textos.ultimosSeisMeses,
    filtros.antecedentesFamiliares && textos.antecedentesFamiliares,
    filtros.publishedFromYear !== null &&
      rellenar(textos.publicadoDesde, { anio: filtros.publishedFromYear }),
  ].filter((texto): texto is string => typeof texto === 'string');
  return activos.join(', ') || ninguno;
}

export function nombrarFuentes(seleccionadas: FuentesConsultadas['selected']): string {
  const { fuentes } = mensajes().evidence.base;
  return seleccionadas.map((fuente) => fuentes[fuente]).join(', ');
}

/**
 * "Qué se buscó…" del resumen; con `tipo_no_habilitado` dice que no se consultó el corpus (RN-20). Con evidencia solo
 * aparece si la búsqueda se repitió con una reformulación (`queryRewritten`, US-238): la reformulación misma no llega aquí.
 */
export function describirBusqueda(
  consultadas: FuentesConsultadas,
  estado: EstadoDelAnalisis,
): string | null {
  const { busqueda, sinConsulta, reescrituraAplicada } = mensajes().evidence.base;
  if (estado === 'con_evidencia') return consultadas.queryRewritten ? reescrituraAplicada : null;
  if (estado === 'tipo_no_habilitado') return sinConsulta;
  return rellenar(busqueda, {
    fuentes: nombrarFuentes(consultadas.selected),
    filtros: nombrarFiltros(consultadas.filters),
    n: consultadas.aboveThreshold,
  });
}
