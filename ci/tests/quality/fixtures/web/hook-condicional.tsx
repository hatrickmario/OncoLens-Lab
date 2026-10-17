import { useState } from 'react';

export function ContadorCondicional({ activo }: { activo: boolean }) {
  if (activo) {
    const [cuenta] = useState(0);
    return <span>{cuenta}</span>;
  }
  return null;
}
