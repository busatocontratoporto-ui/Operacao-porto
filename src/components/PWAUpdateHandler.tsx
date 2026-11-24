import { useEffect } from 'react';

/**
 * Trata atualizações do PWA automaticamente sem manter versões antigas em cache.
 */
export function PWAUpdateHandler() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (!reg) return;
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        reg.update().catch(() => {});
      })
      .catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
}
