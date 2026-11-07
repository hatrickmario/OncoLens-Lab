import { createContext } from 'react';

/**
 * «Expandir todo» de un turno: lo fija la tarjeta del turno y lo leen las tablas de aplicabilidad de sus opciones, a
 * cuatro niveles de la tarjeta (prop drilling por `AnalysisResult`, la lista y cada opción). Acotado a un turno; fuera
 * de uno, `false` (la tabla se pliega como siempre).
 */
export const ExpansionDelTurno = createContext(false);
