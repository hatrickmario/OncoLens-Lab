import type { ReactNode } from 'react';
import { AppHeader } from '../../components/organisms/app-header';

/** Toda página autenticada hereda la cabecera con la etiqueta de uso académico (US-069 AC-3). */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
