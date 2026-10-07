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
// iOS suspends the app in the background; continue (e.g. polling a running transcription) on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') kickRunner();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
