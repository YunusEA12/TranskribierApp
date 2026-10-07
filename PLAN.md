# Mitschrift – Projektplan

> **Arbeitstitel.** Eigener Plaud-Ersatz für Yunus und Calvin:
> aufnehmen → transkribieren (mit Sprechern) → als Markdown im Obsidian-Vault ablegen.
> Die Analyse passiert bewusst außerhalb der App.

Stand: 2026-10-07 · Fakten zu Gemini/GitHub stammen aus den offiziellen Dokus (Links am Ende) und können sich ändern.

---

## 1. Ziel und Abgrenzung

### 1.1 Vorbild: Was Plaud macht – und was wir davon bauen

| Plaud | Mitschrift |
|---|---|
| Aufnahme über eigenes Gerät (Note, NotePin) | Handy-Mikrofon im Browser **plus** Import vorhandener Audiodateien |
| Transkription in 112 Sprachen mit Sprecher-Labels | Ja, über Gemini (1–5 Sprecher, Sprache automatisch) |
| Eigenes Vokabular (Custom Vocabulary) | Ja, als Glossar (Phase 2) |
| Zusammenfassungen, Vorlagen, Mindmaps, „Ask Plaud“ | **Nein** – bewusst extern: Transkript exportieren, mit AI analysieren |
| Highlights während der Aufnahme | Marker-Button (Phase 2) |
| App + Web + Desktop mit Cloud-Sync | Eine PWA für Handy und PC, Sync über das Vault-Repo |
| Export, Teilen, Integrationen (u. a. MCP-Server) | Markdown im Vault, Download, Kopieren; jede AI kann das Repo direkt lesen |
| Abo (Starter 300 Min/Monat, darüber Pro/Unlimited) | Gemini Free Tier mit eigenem API-Key |

Wir orientieren uns an der Funktion, nicht am Auftritt: eigener Name, eigenes UI, keine Plaud-Assets.

### 1.2 Muss (v1)

1. Installierbare Web-App (PWA) für Handy und PC, keine Store-App.
2. Zwei Nutzer (Yunus, Calvin) mit getrennten Historien.
3. Aufnahme im Browser und Import von Audiodateien.
4. Transkript mit Sprechererkennung (1–5 Sprecher), Zeitstempeln, automatischer Spracherkennung.
5. Automatisch erzeugter Titel pro Transkript.
6. Ablage als Markdown im Obsidian-Vault, Historie in der App.
7. Export: `.md`-Download und „In Zwischenablage kopieren“.
8. Kostenlos betreibbar.

### 1.3 Bewusst nicht

- Zusammenfassungen, To-do-Listen, Mindmaps, Chat mit dem Transkript.
- Schönes Design – funktional reicht.
- Eigene Hardware, Telefonmitschnitt, Live-Transkription.
- Eigenes Backend, Login-System, Nutzerverwaltung.

---

## 2. Architektur

```
Handy / PC (Browser, installierte PWA)
┌────────────────────────────────────────────────┐
│ Aufnahme / Import                              │
│      │  Audio + Job-Status in IndexedDB        │
│      ▼                                         │
│ Gemini API (eigener Key, direkt aus Browser)   │──► JSON: Titel, Sprache, Sprecher, Segmente
│      │                                         │
│      ▼                                         │
│ Markdown erzeugen                              │
│      │                                         │
│      ▼                                         │
│ GitHub API (eigener Token)                     │──► privates Vault-Repo des Nutzers
└────────────────────────────────────────────────┘
                                                        │ git pull
                                                        ▼
                                               Obsidian am PC
```

### 2.1 Kernentscheidungen

| Thema | Entscheidung | Begründung |
|---|---|---|
| App-Typ | Statische PWA | Läuft auf Handy und PC, installierbar, kein Store |
| Hosting | GitHub Pages, **öffentliches** App-Repo | Kostenlos; das Repo enthält keine Geheimnisse und keine Daten |
| Backend | Keins | Nichts zu betreiben; der Browser spricht direkt mit Gemini und GitHub |
| Schlüssel | Jeder trägt eigenen Gemini-Key und GitHub-Token in den Einstellungen ein; gespeichert nur lokal im Browser | Kein Key im Repo, getrennte Kontingente |
| „Datenbank“ | Privates GitHub-Repo, das zugleich Obsidian-Vault ist; eine Markdown-Datei pro Transkript | Obsidian ist keine Datenbank, sondern ein Ordner voller Markdown-Dateien. Ein Git-Repo ist der einfachste Weg, vom Handy-Browser in diesen Ordner zu schreiben |
| Nutzer / Historie | **Jeder Nutzer hat sein eigenes privates Vault-Repo** | Getrennte Historien ohne Login-System. Fine-grained Tokens funktionieren nicht für Repos, bei denen man nur Collaborator ist (siehe 4.5) |
| Audio | Bleibt lokal auf dem Gerät (IndexedDB), Download möglich | Git ist für große Binärdateien ungeeignet |
| Analyse | Außerhalb der App | Anforderung |

---

## 3. Transkription mit Gemini

### 3.1 Fakten (Doku-Stand 2026-09-23)

- Audio kostet 32 Tokens pro Sekunde; bis 9,5 Stunden Audio pro Prompt.
- Unterstützte Formate u. a. `audio/webm`, `audio/m4a`, `audio/mp3`, `audio/wav`, `audio/ogg`.
- Files API: bis 2 GB pro Datei, automatische Löschung nach 48 Stunden, kostenlos. Wir laden Audio immer über die Files API hoch und löschen die Datei nach erfolgreichem Transkript aktiv.
- Aktuelle Schnittstelle ist die Interactions API (`client.interactions.create`) im SDK `@google/genai`.

### 3.2 Zwei mögliche Engines

| | **A: Flash-Modell** (aktuell `gemini-3.8-flash`) | **B: `gemini-3.5-transcribe`** |
|---|---|---|
| Art | Multimodales LLM; Transkript per Prompt + JSON-Schema | Spezialisiertes Speech-to-Text-Modell |
| Sprecher | Per Prompt, über die ganze Aufnahme konsistent | Bis 8 Sprecher; ab 3 Sprechern laut Doku „experimentell“ |
| Länge | Bis 9,5 h Eingabe; praktisch begrenzt durch die Ausgabelänge | 1 h pro Request; **mit Sprechererkennung nur 30 min** |
| Glossar | Im Prompt, zusammen mit Sprechern möglich | `custom_vocabulary` – aber **nicht** kombinierbar mit Sprechererkennung |
| Zeitstempel | Pro Abschnitt (MM:SS), können leicht driften | Wortgenau |
| Titel | Im selben Request | Zusätzlicher Request nötig |
| Hauptrisiko | Kann bei langen Aufnahmen Passagen glätten oder auslassen | Stückelung nötig → Sprecher-Nummern zwischen den Stücken nicht konsistent |
| Free Tier | Ja | Ja |

**Vorgehen:** Engine A ist der Default, weil sie 5 Sprecher, Glossar und Titel in einem Request abdeckt. Engine B wird hinter demselben Interface gebaut. Phase 0 testet beide mit einer echten Mehrpersonen-Aufnahme auf Deutsch; danach wird der Default final festgelegt.

Die Modell-ID ist eine Einstellung, keine Konstante im Code – die Modellnamen wechseln alle paar Monate.

### 3.3 Ausgabe der Engine (internes Format)

```json
{
  "title": "Projektplanung Transkript-App",
  "language": "de",
  "speakers": ["S1", "S2"],
  "segments": [
    { "speaker": "S1", "start": "00:00", "text": "…" },
    { "speaker": "S2", "start": "00:42", "text": "…" }
  ]
}
```

### 3.4 Prompt-Regeln (Engine A)

- Wörtlich transkribieren. Nichts zusammenfassen, nichts ergänzen, nichts erfinden.
- Unverständliche Stellen als `[unverständlich]` markieren, nicht raten.
- Sprecher als `S1`…`Sn` benennen und über die ganze Aufnahme gleich halten. Erwartete Sprecherzahl (optional aus der UI) als Hinweis mitgeben.
- Jeder Sprecherwechsel beginnt ein neues Segment; lange Monologe alle ~60 Sekunden umbrechen.
- Sprache der Aufnahme beibehalten, auch bei Sprachwechsel mitten im Satz. Nicht übersetzen.
- Glossar-Begriffe bevorzugen, wenn sie klanglich passen.
- Füllwörter („äh“, „ähm“) entfernen: Einstellung, Default an.
- Titel: maximal 8 Wörter, in der Sprache der Aufnahme, beschreibt das Thema.

### 3.5 Lange Aufnahmen

- v1: bis etwa 60 Minuten in einem Request.
- Darüber (Phase 3): dieselbe hochgeladene Datei, mehrere Requests mit Zeitfenstern („nur Minute 60–120“). Die bisherige Sprecherliste samt kurzer Beschreibung und die letzten Segmente werden als Kontext mitgegeben, damit `S1` weiter `S1` bleibt.

### 3.6 Limits und Kosten

- Die Free-Tier-Limits hängen von Modell und Account ab und stehen im AI Studio. Nicht im Code fest verdrahten.
- Bei HTTP 429: warten und wiederholen (exponentiell, mit Obergrenze), dem Nutzer den Status zeigen.
- Falls das Free Tier nicht reicht: Laut Preisliste kostet `gemini-3.5-transcribe` im Paid Tier rund 0,005 USD pro Minute, also etwa 0,30 USD pro Stunde Audio.

---

## 4. Speicher: Obsidian-Vault als GitHub-Repo

### 4.1 Struktur des Vault-Repos (pro Nutzer, privat)

```
mitschrift-vault/
├── Transkripte/
│   └── 2026/
│       └── 2026-10-07 0841 Projektplanung Transkript-App.md
├── _mitschrift/
│   └── glossar.md          # ein Begriff pro Zeile, wird in den Prompt gegeben
└── README.md
```

### 4.2 Dateiname

`YYYY-MM-DD HHmm <Titel>.md` – Datum und Titel stecken im Namen. Dadurch braucht die Historie nur einen einzigen API-Aufruf (Dateiliste) und muss keine Dateien öffnen. Im Titel verbotene Zeichen (`/ \ : * ? " < > | # ^ [ ]`) werden entfernt.

### 4.3 Dateiformat

```markdown
---
id: 2026-10-07T08-41-12
title: "Projektplanung Transkript-App"
date: 2026-10-07
time: "08:41"
duration_min: 42
user: yunus
language: de
speakers:
  S1: Yunus
  S2: Sprecher 2
model: gemini-3.8-flash
source: recording        # recording | import
tags: [transkript]
---

# Projektplanung Transkript-App

**[00:00] Yunus:** Text des ersten Abschnitts …

**[00:42] Sprecher 2:** Text des zweiten Abschnitts …
```

Dieses Format ist die Schnittstelle zu Obsidian und zur späteren AI-Analyse. Änderungen daran nur bewusst und mit Eintrag im Entscheidungslog (Abschnitt 10).

### 4.4 Zugriff aus der App

- Schreiben: `PUT /repos/{owner}/{repo}/contents/{path}` (Inhalt Base64, bei Update mit `sha`).
- Historie: `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1`, auf `Transkripte/` filtern, Ergebnis in IndexedDB cachen.
- Lesen: Datei erst beim Öffnen laden.
- Umbenennen eines Sprechers: Frontmatter-Map und die Labels im Text aktualisieren, als ein Commit.

### 4.5 Warum ein Repo pro Nutzer

GitHub dokumentiert als Einschränkung, dass fine-grained Tokens nicht für Repos funktionieren, bei denen man nur Collaborator ist. Ein gemeinsames Repo unter Yunus' Account wäre für Calvin also nur mit einem Classic-Token nutzbar, das auf **alle** seine Repos zugreifen darf. Deshalb:

- **Default:** Jeder legt `mitschrift-vault` privat im eigenen Account an und erstellt ein fine-grained Token nur für dieses Repo.
- **Alternative für einen gemeinsamen Vault:** kostenlose GitHub-Organisation mit einem Repo und einem Ordner pro Nutzer. Für die App ist das nur eine andere Einstellung (`owner/repo` + Basisordner).

### 4.6 Obsidian

Am PC das Vault-Repo klonen, den Ordner in Obsidian als Vault öffnen und per Community-Plugin „Git“ automatisch pullen lassen. Auf dem Handy wird Obsidian nicht gebraucht – dort zeigt die PWA die Historie.

---

## 5. Aufnahme im Browser – die wichtigste Einschränkung

Eine Web-App ist kein Diktiergerät. Bei gesperrtem Bildschirm oder App im Hintergrund kann der Browser die Aufnahme anhalten, besonders auf dem iPhone. Deshalb drei Maßnahmen:

1. **Wake Lock:** Bildschirm bleibt während der Aufnahme an (gedimmter Aufnahme-Screen).
2. **Autosave:** Audio wird alle paar Sekunden stückweise in IndexedDB geschrieben. Stürzt etwas ab, ist die Aufnahme bis dahin da.
3. **Import als gleichwertiger Weg:** Mit der Sprachmemo-/Rekorder-App des Handys aufnehmen (läuft auch bei gesperrtem Bildschirm) und die Datei danach in Mitschrift importieren. Für lange Meetings ist das der robuste Weg.

Weitere Punkte:

- iOS liefert `audio/mp4`, Chrome/Android `audio/webm`. Den MIME-Type nie fest annehmen, sondern vom Recorder übernehmen.
- Installierte PWA und Browser-Tab haben auf iOS getrennten Speicher – die Einstellungen müssen in der installierten App eingetragen werden.

---

## 6. Repo-Struktur (App)

```
mitschrift/
├── CLAUDE.md
├── PLAN.md
├── README.md
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .github/workflows/deploy.yml     # Build + Deploy auf GitHub Pages
├── public/icons/
├── spike/                           # Phase 0, Wegwerf-Code
│   └── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── pages/
    │   ├── RecordPage.tsx           # Aufnahme + Import
    │   ├── HistoryPage.tsx          # Liste, Suche, Status offener Jobs
    │   ├── TranscriptPage.tsx       # Anzeige, Sprecher umbenennen, Export
    │   └── SettingsPage.tsx         # Profil, Keys, Modell, Glossar
    ├── components/
    ├── recording/
    │   ├── recorder.ts              # MediaRecorder, Autosave, Wake Lock
    │   └── importAudio.ts
    ├── transcription/
    │   ├── engine.ts                # Interface TranscriptionEngine
    │   ├── flashEngine.ts           # Engine A
    │   ├── transcribeEngine.ts      # Engine B
    │   ├── prompt.ts
    │   └── schema.ts                # JSON-Schema + Validierung
    ├── vault/
    │   ├── githubClient.ts          # fetch-Wrapper, Fehlerbehandlung
    │   ├── vaultRepo.ts             # list / read / write / rename
    │   ├── markdown.ts              # Transkript ⇄ Markdown
    │   └── paths.ts                 # Dateinamen, Bereinigung
    ├── jobs/
    │   └── queue.ts                 # Zustandsmaschine pro Aufnahme
    ├── settings/
    │   └── settingsStore.ts         # localStorage
    ├── db/
    │   └── db.ts                    # IndexedDB: Audio, Jobs, Historien-Cache
    ├── lib/                         # time, base64Utf8, errors
    └── types.ts
```

**Stack:** Vite, React, TypeScript, `vite-plugin-pwa`, Dexie (IndexedDB), `@google/genai`, GitHub REST per `fetch`, Vitest. Kein UI-Framework, schlichtes CSS.

**Job-Zustände:** `recorded → uploading → transcribing → saving → done`, jeweils mit `failed` und „Erneut versuchen“. Ein Job überlebt das Schließen der App.

---

## 7. Phasen

### Phase 0 – Spike (ein Abend, Wegwerf-Code in `spike/`)

Eine einzelne HTML-Seite, die die riskanten Annahmen prüft:

- [ ] Aufnahme 2 Minuten auf iPhone **und** Android; MIME-Type notieren.
- [ ] Upload eines Blobs über die Files API direkt aus dem Browser mit eigenem Key (CORS?).
- [ ] Engine A und Engine B mit derselben echten Aufnahme (3–5 Personen, Deutsch, ca. 20 min): Sprecher-Zuordnung, Auslassungen, Zeitstempel vergleichen.
- [ ] Eine 60-Minuten-Datei im Free Tier – läuft das durch oder greift ein Limit?
- [ ] Markdown-Datei per GitHub-API aus dem Browser ins Vault-Repo schreiben (Umlaute prüfen).

**Ergebnis:** Default-Engine steht fest, Abschnitt 10 ist ergänzt.

### Phase 1 – MVP

- [x] Projekt-Setup, PWA-Manifest, Deploy auf GitHub Pages
- [x] Einstellungen: Name, Gemini-Key, GitHub-Token, `owner/repo`, Modell-ID, „Verbindung testen“
- [x] Aufnahme (Start/Pause/Stopp, Timer) und Datei-Import
- [x] Transkription als Job mit sichtbarem Status
- [x] Markdown erzeugen und ins Vault schreiben
- [x] Historie (Liste aus dem Vault) und Detailansicht
- [x] Export: `.md` herunterladen, in Zwischenablage kopieren

Stand 2026-10-07: Code steht und ist im Browser mit simulierten Gemini-/GitHub-Antworten getestet; Test mit echten Keys auf echten Handys steht aus.

**Fertig, wenn:** Yunus und Calvin auf ihren Handys je eine Aufnahme machen, sie in ihrer Historie und in Obsidian sehen und als Datei herunterladen können.

### Phase 2 – Alltagstauglich

- [ ] Sprecher umbenennen
- [ ] Glossar (im Vault gespeichert, damit Handy und PC dasselbe nutzen)
- [x] Wake Lock, Autosave, Wiederherstellung nach Absturz
- [x] Offline aufnehmen, später transkribieren
- [ ] Suche und Filter in der Historie (einfache Titelsuche ist da)
- [ ] Marker-Button während der Aufnahme (Zeitpunkt wird im Transkript markiert)
- [ ] Einstellungen als Text exportieren/importieren (Handy ↔ PC)
- [ ] Saubere 429-/Netzwerk-Fehlerbehandlung

### Phase 3 – Ausbau

- [ ] Aufnahmen über 60 Minuten (Zeitfenster, siehe 3.5)
- [ ] Transkript in der App korrigieren
- [ ] Weitere Exporte: TXT, SRT, JSON
- [ ] „Analyse-Prompt kopieren“: Transkript plus fertiger Prompt für die externe AI
- [ ] Android: Audiodatei direkt aus der Rekorder-App an Mitschrift „teilen“
- [ ] Optional: komprimiertes Audio im Vault ablegen

---

## 8. Einmaliges Setup (Schritt für Schritt)

1. **App-Repo:** Auf GitHub ein öffentliches Repo `mitschrift` anlegen. `CLAUDE.md` und `PLAN.md` hineinlegen.
2. **Vault-Repo (jeder für sich):** Privates Repo `mitschrift-vault` anlegen, mit README initialisieren, damit der Branch `main` existiert.
3. **GitHub-Token (jeder für sich):** Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token. Repository access: *Only select repositories* → `mitschrift-vault`. Permissions: *Contents* → *Read and write*.
4. **Gemini-Key (jeder für sich):** Im Google AI Studio unter „Get API key“ einen Key erstellen.
5. **GitHub Pages:** Im App-Repo Settings → Pages → Source: *GitHub Actions* (sobald der Workflow aus Phase 1 existiert).
6. **App einrichten:** Pages-URL öffnen, zum Home-Bildschirm hinzufügen, in der installierten App die Einstellungen ausfüllen.
7. **Obsidian am PC:** Vault-Repo klonen, Ordner als Vault öffnen, Plugin „Git“ für automatisches Pullen einrichten.

Keys und Tokens gehören nie ins Repo, in Issues oder in Chat-Verläufe.

---

## 9. Datenschutz und Nutzungsbedingungen

Keine Rechtsberatung, nur die Punkte, die man kennen sollte:

- **Einwilligung:** Gespräche nur aufnehmen, wenn alle Beteiligten zugestimmt haben. Heimliches Aufnehmen nichtöffentlicher Gespräche ist in Deutschland strafbar (§ 201 StGB).
- **Vertrauliches:** Aufnahmen aus dem Job nur, wenn der Arbeitgeber die Verarbeitung durch Google erlaubt.
- **Datennutzung durch Google:** Im Free Tier darf Google Inhalte grundsätzlich zur Produktverbesserung nutzen. Für Nutzer im EWR gelten laut Gemini-API-Bedingungen aber auch beim kostenlosen Kontingent die Datenregeln der bezahlten Dienste (keine Nutzung zur Produktverbesserung).
- **Free Tier und zweite Person:** Dieselben Bedingungen verlangen bezahlte Dienste, wenn man eine Anwendung Nutzern im EWR *bereitstellt*, und richten die API an Entwickler ab 18. Deshalb nutzt jeder ausschließlich seinen eigenen Key in seinem eigenen Projekt. Wer auf Nummer sicher gehen will, aktiviert die Abrechnung; die Kosten liegen im Cent-Bereich pro Stunde Audio (siehe 3.6).
- **Aufräumen:** Hochgeladenes Audio nach dem Transkript bei Google löschen (sonst automatisch nach 48 Stunden).

---

## 10. Offene Entscheidungen und Entscheidungslog

| # | Frage | Vorschlag | Status |
|---|---|---|---|
| 1 | Engine A oder B als Default? | A, nach Test in Phase 0 bestätigen | offen |
| 2 | Getrennte Vault-Repos oder gemeinsame Organisation? | Getrennt | entschieden: getrennt, jeder mit eigenem Key (2026-10-07) |
| 3 | Audio dauerhaft aufbewahren? | Nur lokal auf dem Gerät, manuell löschbar | offen |
| 4 | Füllwörter entfernen als Default? | Ja | offen |
| 5 | Welche Handys (iPhone/Android)? | Bestimmt, wie wichtig der Import-Weg ist | offen |
| 6 | Endgültiger Name | „Mitschrift“ ist Arbeitstitel | offen |

Getroffene Entscheidungen hier mit Datum eintragen.

| Datum | Entscheidung |
|---|---|
| 2026-10-07 | Spike-Seite wird für Phase 0 per eigenem Workflow (`spike-pages.yml`) auf GitHub Pages veröffentlicht, weil das Mikrofon auf dem Handy nur über HTTPS geht. In Phase 1 ersetzt `deploy.yml` diesen Workflow. |
| 2026-10-07 | Phase 1 parallel zu den Phase-0-Tests begonnen. Engine A ist vorläufiger Default; Engine B ist eingebaut und holt den Titel mit einem zweiten Request vom Flash-Modell. |
| 2026-10-07 | `deploy.yml` ersetzt `spike-pages.yml`: App unter der Pages-URL, Spike unter `<pages-url>/spike/`. |
| 2026-10-07 | 429/5xx: Das Gemini-SDK wiederholt selbst (bis 4 Versuche mit Backoff). Keine eigene Retry-Schleife; schlägt es endgültig fehl, zeigt der Job „Erneut versuchen“. |
| 2026-10-07 | Ersatzmodell: Ist das Kontingent des Hauptmodells erschöpft (429 nach den SDK-Wiederholungen), transkribiert ein in den Einstellungen gewähltes schwächeres Modell. `model:` im Frontmatter nennt das tatsächlich verwendete Modell. Die Modellliste kommt per API vom eigenen Key, damit keine Namen geraten werden müssen. |
| 2026-10-07 | Jeder nutzt seinen eigenen Gemini-Key und Token, eingetragen in den Einstellungen der App (nur lokal gespeichert, kein Login). Bestätigt Entscheidung 2 (getrennte Vault-Repos). |

---

## 11. Ideen für später (nicht eingeplant)

- Stimmen wiedererkennen: beim ersten Mal benannte Sprecher beim nächsten Transkript vorschlagen (Beschreibung der Stimme im Prompt mitgeben – Qualität unklar, erst testen).
- Notizen oder Fotos (Whiteboard) während der Aufnahme an das Transkript hängen.
- Wöchentliche Übersichtsnotiz im Vault mit Links auf alle Transkripte (Obsidian Dataview kann das auch ohne App).
- Qualitätsanzeige: Anteil `[unverständlich]` pro Transkript als Hinweis auf schlechte Aufnahmebedingungen.

---

## Quellen

- Plaud: [App-Store-Beschreibung](https://apps.apple.com/us/app/-/id6450364080)
- Gemini: [Audio understanding](https://ai.google.dev/gemini-api/docs/audio) · [Audio transcription](https://ai.google.dev/gemini-api/docs/transcribe) · [Files API](https://ai.google.dev/gemini-api/docs/files) · [Pricing](https://ai.google.dev/gemini-api/docs/pricing) · [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) · [Additional Terms of Service](https://ai.google.dev/gemini-api/terms)
- GitHub: [Personal access tokens – Einschränkungen](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
