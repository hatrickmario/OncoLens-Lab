/** Reloj inyectable: el dominio y los services no llaman a `Date.now()` (CLAUDE.md, Política TDD). */
export interface Clock {
  now(): Date;
}
