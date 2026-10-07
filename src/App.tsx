import { useLiveQuery } from 'dexie-react-hooks';
import { Icon } from './components/Icon';
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
      <main>
        {route.page === 'record' && <RecordPage />}
        {route.page === 'history' && <HistoryPage />}
        {route.page === 'settings' && <SettingsPage />}
        {route.page === 'transcript' && <TranscriptPage key={route.id} id={route.id} />}
      </main>
      <nav className="tabbar" aria-label="Hauptnavigation">
        <a href={hrefFor.record} className={`rec-tab ${route.page === 'record' ? 'active' : ''}`}>
          <Icon name="mic" size={24} />
          Aufnahme
        </a>
        <a href={hrefFor.history} className={route.page === 'history' || route.page === 'transcript' ? 'active' : ''}>
          <Icon name="history" size={24} />
          Verlauf
          {openJobs ? <span className="badge">{openJobs}</span> : null}
        </a>
        <a href={hrefFor.settings} className={route.page === 'settings' ? 'active' : ''}>
          <Icon name="settings" size={24} />
          Einstellungen
        </a>
      </nav>
    </>
  );
}
