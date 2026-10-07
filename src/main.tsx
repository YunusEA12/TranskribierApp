import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { requestPersistentStorage } from './db/db';
import { kickRunner } from './jobs/runner';
import './styles.css';

registerSW({ immediate: true });
void requestPersistentStorage();

// Resume jobs interrupted by closing the app, and pick up offline recordings when back online.
kickRunner();
window.addEventListener('online', kickRunner);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
