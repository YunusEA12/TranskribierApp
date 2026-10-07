import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import { HistoryPage } from './pages/HistoryPage';
import { RecordPage } from './pages/RecordPage';
import { SettingsPage } from './pages/SettingsPage';
import { TranscriptPage } from './pages/TranscriptPage';
import { hrefFor, useRoute } from './router';

export function App() {
  const route = useRoute();
  const openJobs = useLiveQuery(() => db.jobs.filter((j) => j.status !== 'done').count(), []);

  return (
    <>
      <nav>
        <a href={hrefFor.record} className={route.page === 'record' ? 'active' : ''}>
          Aufnahme
        </a>
        <a href={hrefFor.history} className={route.page === 'history' || route.page === 'transcript' ? 'active' : ''}>
          Verlauf{openJobs ? ` (${openJobs})` : ''}
        </a>
        <a href={hrefFor.settings} className={route.page === 'settings' ? 'active' : ''}>
          Einstellungen
        </a>
      </nav>
      <main>
        {route.page === 'record' && <RecordPage />}
        {route.page === 'history' && <HistoryPage />}
        {route.page === 'settings' && <SettingsPage />}
        {route.page === 'transcript' && <TranscriptPage key={route.path} path={route.path} />}
      </main>
    </>
  );
}
