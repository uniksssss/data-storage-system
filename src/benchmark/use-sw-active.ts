import { useEffect, useState } from 'react';

export function useSwActive(): boolean {
  const [swActive, setSwActive] = useState(false);

  useEffect(() => {
    const check = () => setSwActive(!!navigator.serviceWorker?.controller);
    check();
    navigator.serviceWorker?.addEventListener('controllerchange', check);
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', check);
  }, []);

  return swActive;
}
