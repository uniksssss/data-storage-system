import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import type { RegisterSWOptions } from 'virtual:pwa-register';
import './index.css';
import App from './App.tsx';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const options: RegisterSWOptions = {
      onRegistered(registration: ServiceWorkerRegistration | undefined) {
        console.log('SW registered: ', registration);
      },
      onRegisterError(error: any) {
        console.log('SW registration failed: ', error);
      },
    };

    registerSW(options);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
