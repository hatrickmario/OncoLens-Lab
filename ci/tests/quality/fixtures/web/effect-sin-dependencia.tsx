import { useEffect, useState } from 'react';

export function EtiquetaConEfecto({ texto }: { texto: string }) {
  const [copia, setCopia] = useState('');
  useEffect(() => {
    setCopia(texto);
  }, []);
  return <span>{copia}</span>;
}
