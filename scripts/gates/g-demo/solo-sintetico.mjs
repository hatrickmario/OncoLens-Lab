/**
 * RN-13 en el gate G-Demo (US-142 AC-3): todo paciente de la demo es `sintetico` y las dos variables de datos reales
 * están apagadas. Solo maneja conteos agregados y nombres de variable: nunca filas, identidad ni cadenas de conexión (RN-14).
 */
export const ORIGENES = ['sintetico', 'real_anonimizado', 'real_identificado'];
export const VARIABLES_DE_DATOS_REALES = ['REAL_ANONYMIZED_ENABLED', 'REAL_IDENTIFIED_ENABLED'];

function conteoAgregado(conteoPorOrigen) {
  return Object.fromEntries(
    ORIGENES.map((origen) => [origen, Number(conteoPorOrigen[origen] ?? 0)]),
  );
}

export function verificarSoloSintetico(conteoPorOrigen, banderas) {
  if (!conteoPorOrigen || typeof conteoPorOrigen !== 'object') {
    return {
      ok: false,
      verificable: false,
      motivos: ['no se pudo verificar el origen de los datos'],
      conteo: null,
      banderas: null,
    };
  }
  const conteo = conteoAgregado(conteoPorOrigen);
  const motivos = [];
  // Cualquier origen distinto de sintetico con pacientes cuenta, aunque el enum crezca con un origen nuevo.
  const noSinteticos = Object.entries(conteoPorOrigen).some(
    ([origen, n]) => origen !== 'sintetico' && Number(n) > 0,
  );
  if (noSinteticos) motivos.push('datos no sintéticos');
  // Solo el nombre de la variable y si está activa: ningún otro valor de la configuración llega al registro.
  // Una variable que no se pudo leer cuenta como activa: el gate nunca la da por apagada.
  const valores = Object.fromEntries(
    VARIABLES_DE_DATOS_REALES.map((nombre) => [nombre, banderas?.[nombre] !== false]),
  );
  for (const nombre of VARIABLES_DE_DATOS_REALES) {
    if (valores[nombre]) motivos.push(`${nombre} no está en false`);
  }
  return { ok: motivos.length === 0, verificable: true, motivos, conteo, banderas: valores };
}
