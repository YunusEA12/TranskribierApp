import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { requestPersistentStorage } from './db/db';
import { kickRunner } from './jobs/runner';
import { startUpdates } from './pwa/update';
import { recorder } from './recording/recorder';
import './styles.css';

startUpdates({ isIdle: () => recorder.state === 'idle' });
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
