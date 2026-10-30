/** Tipos de cáncer que este despliegue analiza (`ENABLED_CANCER_TYPES` validada contra el catálogo, RN-20). */
export interface TiposDeCancerHabilitados {
  estaHabilitado(tipo: string): boolean;
}
