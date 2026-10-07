# Mitschrift

Private Transkript-App für zwei Nutzer (Yunus, Calvin) nach dem Vorbild von Plaud:
Audio aufnehmen oder importieren → mit Gemini transkribieren (Sprecher, Zeitstempel, Titel) → als Markdown in den gemeinsamen Speicher schreiben: ein privates GitHub-Repo (`YunusEA12/mitschrift-daten`), Ordner `Transkripte/<Name>/<Jahr>/`. Beide sehen in der App die gemeinsame Historie.

Statische PWA auf GitHub Pages. Kein Backend. Die Analyse der Transkripte passiert außerhalb der App.

Plan, Begründungen und Phasen stehen in `PLAN.md`. Vor einer Aufgabe den passenden Abschnitt lesen, nicht die ganze Datei.

## Status

Phase 1 im Test auf echten Handys: Aufnahme mit Taschen-Modus, Transkription per Streaming (App bleibt offen), gemeinsamer Speicher (GitHub-Repo) mit QR-Einladung, gemeinsame Historie, Fehlersuche in den Einstellungen. Diese Zeile beim Phasenwechsel aktualisieren.

## Stack

- Vite, React, TypeScript (strict)
- `vite-plugin-pwa` für Manifest und Service Worker
- Dexie (IndexedDB) für Audio, Jobs und den Historien-Cache
- `@google/genai` für Gemini: Files API für den Upload, `generateContentStream` für das Transkript (Engine B: Interactions API)
- GitHub REST API per `fetch` für den gemeinsamen Speicher, kein Octokit
- `qrcode` und `jsqr` für die Einladung per QR-Code
- Vitest für Logik-Tests
- Schlichtes CSS, kein UI-Framework

## Befehle

```bash
npm run dev      # lokaler Dev-Server
npm run build    # Produktions-Build nach dist/
npm run test     # Vitest
npm run lint     # ESLint + tsc --noEmit
```

Deploy läuft automatisch über `.github/workflows/deploy.yml` bei Push auf `main` (Lint, Tests, Build; Spike wird nach `/spike/` kopiert). Pull Requests werden nur gebaut und getestet.

## Aufbau

```
src/recording/      Aufnahme (MediaRecorder, Autosave, Wake Lock), Datei-Import
src/transcription/  TranscriptionEngine-Interface, flashEngine, transcribeEngine, Prompt, Schema
src/vault/          Markdown-Erzeugung, Dateinamen, GitHub-Client, gemeinsamer Speicher
src/components/     kleine UI-Bausteine (Icons)
src/jobs/           Zustandsmaschine pro Aufnahme
src/settings/       Einstellungen in localStorage
src/db/             IndexedDB
src/pages/          Record, History, Transcript, Settings
spike/              Wegwerf-Code aus Phase 0, wird unter /spike/ deployt
```

Datenfluss: `recording` → Job in `jobs/queue.ts` → `transcription` → `vault/markdown.ts` → Tabelle `transcripts` in IndexedDB → `vault/vaultRepo.ts` (Repo). Historie: lokale `transcripts` + Repo-Liste (`remote`).

Job-Zustände: `recorded → uploading → transcribing → saving → done`, jeder Schritt kann `failed` werden und muss wiederholbar sein.

## Feste Regeln

1. **Keine Geheimnisse im Repo.** Das Repo ist öffentlich. Gemini-Key und GitHub-Token kommen nur aus den Einstellungen (localStorage). Keine Keys in Code, Tests, `.env`-Dateien, Beispielen oder Logs.
2. **Keine Analyse-Funktionen.** Keine Zusammenfassungen, To-dos, Mindmaps oder Chat. Die App liefert Transkript und Titel, sonst nichts.
3. **Kein Backend.** Keine Server-Funktionen, keine Proxys, keine Datenbank-Dienste. Wenn etwas ohne Backend nicht geht: stoppen und nachfragen.
4. **Das Markdown-Format ist eine Schnittstelle** (`PLAN.md` Abschnitt 4.3). Frontmatter-Felder und Zeilenformat nicht ändern, ohne es abzusprechen und in `PLAN.md` Abschnitt 10 einzutragen.
5. **Modell-ID nie fest verdrahten.** Sie kommt aus den Einstellungen; im Code steht nur ein Default an einer einzigen Stelle.
6. **Wörtlich transkribieren.** Der Prompt darf nichts zusammenfassen, glätten oder erfinden. Unverständliches wird `[unverständlich]`.
7. **MIME-Type nie annehmen.** iOS liefert `audio/mp4`, Chrome `audio/webm`. Immer den Typ vom Recorder bzw. von der importierten Datei übernehmen.
8. **Audio nicht ins Vault committen.** Audio bleibt in IndexedDB. Bei Google hochgeladene Dateien nach erfolgreichem Transkript löschen.
9. **Aufnahmen dürfen nie verloren gehen.** Erst lokal speichern, dann verarbeiten. Ein Fehler bei Gemini oder GitHub lässt die Aufnahme unangetastet.
10. **Nichts von Plaud übernehmen** außer der Idee: keine Namen, Texte, Logos oder Screenshots.
11. **Design gehört dazu.** Die Nutzer wollen ein ansprechendes UI (seit 2026-10-07). Farben nur über die Tokens in `src/styles.css`, beide Themes (hell/dunkel), Systemschriften, Handy zuerst.
12. **Pflicht sind nur der API-Key, „Wer bist du?“ (Yunus/Calvin) und die Verbindung zum Speicher** (Yunus: Token, Calvin: QR-Code). Keine neue Pflicht-Einstellung einführen, ohne nachzufragen.
13. **Der Speicher-Token verlässt das Gerät nur als QR-Code auf dem Bildschirm** (Einladung). Nie in Logs, Links oder Dateien.

## Arbeitsweise

- Nach den Phasen in `PLAN.md` Abschnitt 7 arbeiten und erledigte Punkte dort abhaken.
- Kleine Schritte, ein Thema pro Commit.
- Entscheidungen mit Datum in `PLAN.md` Abschnitt 10 eintragen.
- Gemini- und GitHub-Details gegen die aktuelle Doku prüfen (Links am Ende von `PLAN.md`), nicht aus dem Gedächtnis schreiben. Die Interactions API ist neu, Modellnamen und Limits ändern sich häufig.
- Reine Logik (`vault/markdown.ts`, `vault/paths.ts`, `settings/invite.ts`, `transcription/schema.ts`, `jobs/queue.ts`) bekommt Vitest-Tests. Aufnahme und PWA-Verhalten werden von Hand auf echten Handys getestet; dafür eine kurze Test-Anleitung ausgeben.
- Netzwerkaufrufe laufen nur über `vault/githubClient.ts` und `transcription/` (Gemini), nicht direkt aus Komponenten.
- Fehler werden dem Nutzer als verständlicher deutscher Satz gezeigt, mit „Erneut versuchen“.

## Sprache

- UI-Texte: Deutsch
- Code, Bezeichner, Kommentare, Commit-Nachrichten: Englisch
- Dateien im Vault: Deutsch (`Transkripte/`, `Sprecher 2`)
