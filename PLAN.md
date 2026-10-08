# Mitschrift – Projektplan

> **Arbeitstitel.** Eigener Plaud-Ersatz für Yunus und Calvin:
> aufnehmen → transkribieren (mit Sprechern) → als Markdown in einem gemeinsamen Speicher ablegen.
> Stand 2026-10-07: Speicher ist ein privates GitHub-Repo (`YunusEA12/mitschrift-daten`), Ordner pro Person, gemeinsame Historie in der App. Obsidian ist optional (siehe Abschnitt 10).
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
| App + Web + Desktop mit Cloud-Sync | Eine PWA für Handy und PC; Sync übernimmt Obsidian |
| Export, Teilen, Integrationen (u. a. MCP-Server) | Notiz in Obsidian, Download, Kopieren, Teilen |
| Abo (Starter 300 Min/Monat, darüber Pro/Unlimited) | Gemini Free Tier mit eigenem API-Key |

Wir orientieren uns an der Funktion, nicht am Auftritt: eigener Name, eigenes UI, keine Plaud-Assets.

### 1.2 Muss (v1)

1. Installierbare Web-App (PWA) für Handy und PC, keine Store-App.
2. Zwei Nutzer (Yunus, Calvin) mit gemeinsamer Historie und getrennten Ordnern.
3. Aufnahme im Browser und Import von Audiodateien.
4. Transkript mit Sprechererkennung (1–5 Sprecher), Zeitstempeln, automatischer Spracherkennung.
5. Automatisch erzeugter Titel pro Transkript.
6. Ablage als Markdown im gemeinsamen privaten GitHub-Repo, Historie in der App. Pflicht: Gemini-Key, Nutzer und geprüfter Speicher.
7. Export: `.md`-Download und „In Zwischenablage kopieren“.
8. Kostenlos betreibbar.

### 1.3 Bewusst nicht

- Zusammenfassungen, To-do-Listen, Mindmaps, Chat mit dem Transkript.
- Übernahme fremder Marken oder Assets. Eigenes Design gehört zur App.
- Eigene Hardware, Telefonmitschnitt, Live-Transkription.
- Eigenes Backend, Login-System, Nutzerverwaltung.

---

## 2. Architektur

```text
Aufnahme / Import → Audio und Job in IndexedDB
  → Gemini (kleine Dateien inline, große über Files API)
  → Transkript als Markdown lokal speichern
  → gemeinsames privates GitHub-Repo
  → gemeinsame Historie; Obsidian optional am PC
```

### 2.1 Kernentscheidungen

| Thema | Entscheidung | Begründung |
|---|---|---|
| App-Typ | Statische PWA | Läuft auf Handy und PC, installierbar, kein Store |
| Hosting | GitHub Pages, **öffentliches** App-Repo | Kostenlos; das Repo enthält keine Geheimnisse und keine Daten |
| Backend | Keins | Nichts zu betreiben; der Browser spricht direkt mit Gemini und GitHub |
| Schlüssel | Eigener Gemini-Key und gemeinsamer GitHub-Token; gespeichert nur lokal im Browser | Kein Key im Repo, getrennte Kontingente, keine weitere Einrichtung |
| „Datenbank“ | Ein privates GitHub-Repo für beide (`mitschrift-daten`), eine Markdown-Datei pro Transkript unter `Transkripte/<Name>/<Jahr>/` | Kostenlos, kein Server, für KI-Analyse direkt lesbar. Obsidian Sync wäre kostenpflichtig für beide und komplizierter |
| Nutzer / Historie | Gemeinsame Historie in der App aus dem Repo, Filter Alle/Yunus/Calvin | Wunsch: jeder sieht alles, getrennte Ordner |
| Zugang zum Speicher | Yunus erstellt einmal einen fine-grained Token nur für dieses Repo; Calvin übernimmt ihn per QR-Code aus Yunus' App | Calvin braucht kein GitHub-Konto. Der Token erscheint nur auf dem Bildschirm, nie im Repo oder in Chats |
| Audio | Bleibt lokal auf dem Gerät (IndexedDB), Download möglich | Git ist für große Binärdateien ungeeignet |
| Analyse | Außerhalb der App | Anforderung |

---

## 3. Transkription mit Gemini

### 3.1 Fakten (Doku-Stand 2026-09-23)

- Audio kostet 32 Tokens pro Sekunde; bis 9,5 Stunden Audio pro Prompt.
- Unterstützte Formate u. a. `audio/webm`, `audio/m4a`, `audio/mp3`, `audio/wav`, `audio/ogg`.
- Files API: automatische Löschung nach 48 Stunden. Die App schickt Aufnahmen bis 8 MB inline; größere Dateien werden hochgeladen und nach erfolgreichem Transkript aktiv gelöscht.
- Engine A nutzt `models.generateContentStream` mit einem normalen `generateContent`-Versuch bei ausgefallenem Streaming. Engine B nutzt die Interactions API (`client.interactions.create`) im SDK `@google/genai`.

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
- Bricht die Antwort ab (Verbindung weg, Stream endet mitten in einer Nachricht, Antwort zu lang), bleiben die fertigen Segmente erhalten. Die App fragt den Rest ab dem Anfang des letzten Segments neu an, mit Sprecherliste und den letzten Segmenten als Kontext, und fügt beides zusammen. Der Zwischenstand liegt im Job, „Erneut versuchen“ macht dort weiter.
- Darüber (Phase 3): dieselbe hochgeladene Datei, mehrere Requests mit Zeitfenstern („nur Minute 60–120“). Die bisherige Sprecherliste samt kurzer Beschreibung und die letzten Segmente werden als Kontext mitgegeben, damit `S1` weiter `S1` bleibt.

### 3.6 Limits und Kosten

- Die Free-Tier-Limits hängen von Modell und Account ab und stehen im AI Studio. Nicht im Code fest verdrahten.
- Bei HTTP 429: warten und wiederholen (exponentiell, mit Obergrenze), dem Nutzer den Status zeigen.
- Falls das Free Tier nicht reicht: Laut Preisliste kostet `gemini-3.5-transcribe` im Paid Tier rund 0,005 USD pro Minute, also etwa 0,30 USD pro Stunde Audio.

---

## 4. Speicher: Obsidian-Vault

> Aktueller Stand: Ein gemeinsames privates GitHub-Repo ist der Speicher. Obsidian kann dieses Repo am PC als Vault öffnen. Die App verwendet keine `obsidian://`-Übergabe mehr.

### 4.1 Struktur des Vault-Repos (pro Nutzer, privat)

```
mitschrift-vault/
├── Transkripte/
│   ├── Yunus/
│   │   └── 2026/
│   │       └── 2026-10-07 0841 Projektplanung Transkript-App.md
│   └── Calvin/
│       └── 2026/
├── _mitschrift/
│   └── glossar.md          # ein Begriff pro Zeile, wird in den Prompt gegeben
└── README.md
```

### 4.2 Dateiname

`Transkripte/<Name>/<Jahr>/YYYY-MM-DD HHmm <Titel>.md` – ein Ordner pro Person (Name aus „Wer nimmt auf?“; ohne Namen entfällt die Ebene). Datum und Titel stecken im Namen. Dadurch braucht die Historie nur einen einzigen API-Aufruf (Dateiliste) und muss keine Dateien öffnen. Im Titel verbotene Zeichen (`/ \ : * ? " < > | # ^ [ ]`) werden entfernt.

### 4.3 Dateiformat

```markdown
---
id: 2026-10-07T08-41-12
title: "Projektplanung Transkript-App"
aliases: ["Projektplanung Transkript-App"]
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

### 4.5 Gemeinsamer Speicher

Yunus richtet `YunusEA12/mitschrift-daten` und einen fine-grained Token nur für dieses Repo mit Contents: Read and write ein. Calvin übernimmt die Verbindung per QR-Code. Jeder verwendet einen eigenen Gemini-Key.

Bei einem gleichen Dateinamen wird ein Suffix gewählt. Vorhandene, abweichende Inhalte werden niemals überschrieben. Identischer Inhalt gilt bei Wiederholung als bereits gespeichert.

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
- [ ] Glossar (ohne GitHub: in den Einstellungen; Export/Import zwischen Geräten)
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

1. App-Link öffnen und zum Home-Bildschirm hinzufügen.
2. In der installierten App den eigenen Gemini-Key eintragen und prüfen.
3. Yunus oder Calvin auswählen.
4. Yunus: privates Repo `mitschrift-daten` erstellen, Token für dieses Repo mit Contents: Read and write anlegen und verbinden.
5. Calvin: Einladung in Yunus' App scannen. Erst eine erfolgreiche Verbindungsprüfung speichert neue Zugangsdaten.
6. Kurze Aufnahme machen, fertigstellen und den Verlauf bis zum gespeicherten Transkript prüfen.
7. Optional am PC: Repo klonen und in Obsidian als Vault öffnen.

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
| 2 | Getrennte Vault-Repos oder gemeinsame Organisation? | – | ersetzt (2026-10-07): kein Vault-Repo mehr nötig, gemeinsamer Vault über Obsidian-Sync möglich |
| 3 | Audio dauerhaft aufbewahren? | Nur lokal auf dem Gerät, manuell löschbar | offen |
| 4 | Füllwörter entfernen als Default? | Ja | offen |
| 5 | Welche Handys (iPhone/Android)? | Bestimmt, wie wichtig der Import-Weg ist | offen |
| 6 | Endgültiger Name | „Mitschrift“ ist Arbeitstitel | offen |

Getroffene Entscheidungen hier mit Datum eintragen.

| Datum | Entscheidung |
|---|---|
| 2026-10-08 | Zweite Stabilisierung: Speicherprüfung testet Contents-Schreibzugriff mit einem festen, nicht im Branch referenzierten Blob; leere Repos werden mit `.mitschrift/README.md` initialisiert. Falsche Branches und Branch-Schutz werden nicht durch Schreiben auf dem Standardbranch umgangen. Engine B gibt ein fertiges Transkript nach spätestens 30 s ohne Titel zurück. Abbruchsignale erreichen Upload und Interactions-Anfragen. Eine unterbrochene Aufnahme muss vor einer neuen gesichert oder verworfen werden. 82 automatisierte Tests sowie Lint, TypeScript und PWA-Build erfolgreich; echte Handy-Aufnahme und Gemini-Zugang bleiben als Abnahmetest offen. |
| 2026-10-07 | Stabilisierung: unabhängige Zeitgrenzen auch bei ignorierten Abbrüchen, einmalige normale Antwort bei ausgefallener Streaming-Verbindung, Verarbeitung anhalten ohne Audioverlust. Updates während Aufnahme und Verarbeitung gesperrt. Dateikonflikte überschreiben keine fremden Transkripte. Nachgeholte Uploads schließen Jobs ab. GitHub-Anfragen inklusive Antwortinhalt auf 30 s begrenzt. Neue Speicherverbindungen werden erst nach erfolgreicher Prüfung übernommen. |
| 2026-10-07 | Spike-Seite wird für Phase 0 per eigenem Workflow (`spike-pages.yml`) auf GitHub Pages veröffentlicht, weil das Mikrofon auf dem Handy nur über HTTPS geht. In Phase 1 ersetzt `deploy.yml` diesen Workflow. |
| 2026-10-07 | Phase 1 parallel zu den Phase-0-Tests begonnen. Engine A ist vorläufiger Default; Engine B ist eingebaut und holt den Titel mit einem zweiten Request vom Flash-Modell. |
| 2026-10-07 | `deploy.yml` ersetzt `spike-pages.yml`: App unter der Pages-URL, Spike unter `<pages-url>/spike/`. |
| 2026-10-07 | 429/5xx: Das Gemini-SDK wiederholt selbst (bis 4 Versuche mit Backoff). Keine eigene Retry-Schleife; schlägt es endgültig fehl, zeigt der Job „Erneut versuchen“. |
| 2026-10-07 | Ersatzmodell: Ist das Kontingent des Hauptmodells erschöpft (429 nach den SDK-Wiederholungen), transkribiert ein in den Einstellungen gewähltes schwächeres Modell. `model:` im Frontmatter nennt das tatsächlich verwendete Modell. Die Modellliste kommt per API vom eigenen Key, damit keine Namen geraten werden müssen. |
| 2026-10-07 | Jeder nutzt seinen eigenen Gemini-Key und Token, eingetragen in den Einstellungen der App (nur lokal gespeichert, kein Login). Bestätigt Entscheidung 2 (getrennte Vault-Repos). |
| 2026-10-07 | **Nur noch der API-Key ist Pflicht.** Wunsch der Nutzer: kein GitHub. Transkripte liegen in der App (IndexedDB) und werden per `obsidian://new` an Obsidian übergeben (4.7). GitHub bleibt als optionale Sicherung unter „Weitere Einstellungen“. Die Historie kommt nicht mehr aus dem Repo, sondern aus der App. Das Markdown-Format (4.3) bleibt unverändert. |
| 2026-10-07 | Gemeinsamer Vault („unser Vault“) ist möglich: Die App braucht nur den Vault-Namen; synchronisiert wird über Obsidian selbst. Ersetzt Entscheidung 2. |
| 2026-10-07 | Ein gemeinsamer, synchronisierter Vault, aber getrennte Ordner: Notizen landen unter `Transkripte/<Name>/<Jahr>/`. Der Name kommt aus „Wer nimmt auf?“ und bleibt optional (ohne Namen: `Transkripte/<Jahr>/`). Frontmatter und Zeilenformat (4.3) unverändert. |
| 2026-10-07 | Formatänderung (mit Nutzer abgesprochen): neues Frontmatter-Feld `aliases` mit dem Gemini-Titel. Damit finden Obsidians Schnellsuche und `[[Titel]]`-Links die Notiz über den reinen Titel; der Dateiname behält Datum und Uhrzeit vorne. Ältere Notizen ohne `aliases` bleiben lesbar. |
| 2026-10-07 | Erster echter Test (iPhone, 19-min-Import): Transkription brach mit „Load failed“ ab, weil iOS die App im Hintergrund pausiert und die offene Anfrage kappt. Lösung: Transkription läuft als Gemini-Interaction mit `background: true`; die App speichert die Id im Job und fragt nur noch kurz nach (Polling). Abbrüche beim Nachfragen werden übersprungen, nach Neustart oder Rückkehr in die App geht es beim selben Auftrag weiter. Hochladen braucht weiterhin die geöffnete App. |
| 2026-10-07 | Updates der installierten App: Service Worker im Modus `prompt` statt `autoUpdate`. Neue Versionen werden im Hintergrund geladen und nur eingespielt, wenn keine Aufnahme läuft (direkt nach dem Öffnen, beim Verlassen der App oder per Tipp auf „Aktualisieren“). Version und „Nach Update suchen“ in den Einstellungen. Neu installieren ist nie nötig. |
| 2026-10-07 | Fester gemeinsamer Vault „Mitschrift“ statt Vault-Name-Abfrage. Pflicht sind nur noch Key und „Wer bist du?“ (Yunus/Calvin); ohne Namen wartet die Verarbeitung, damit keine Notiz ohne Personenordner entsteht. Speichern in Obsidian direkt aus dem Verlauf. Die gemeinsame Historie ist der Vault in Obsidian; die Historie in der App bleibt pro Gerät (eine geteilte App-Historie bräuchte einen gemeinsamen Speicher, offen). |
| 2026-10-07 | **Speicher gewechselt: gemeinsames privates GitHub-Repo statt Obsidian.** Obsidian hätte für einen geteilten Vault Obsidian Sync für beide (kostenpflichtig) und eine für die Nutzer zu komplizierte Einrichtung gebraucht, und die App hätte trotzdem keine gemeinsame Historie zeigen können. Jetzt: Repo `YunusEA12/mitschrift-daten`, Ordner `Transkripte/<Name>/<Jahr>/`, Speichern automatisch nach dem Transkribieren, gemeinsame Historie in der App. Einrichtung: Yunus legt Repo und Token an (vorbefüllte Links), Calvin scannt einen QR-Code in Yunus' App. Pflicht: Key, „Wer bist du?“, Speicher. Die Übergabe per `obsidian://` ist entfernt; wer Obsidian nutzen will, öffnet das Repo am PC als Vault. Markdown-Format (4.3) unverändert. |
| 2026-10-07 | Zweiter Handy-Test: „400 Audio input modality is not enabled for models/gemini-3.8-flash-agent“. „-agent“-Modelle nehmen kein Audio. Abhilfe: solche Modelle werden nicht mehr vorgeschlagen und beim Laden der Einstellungen auf das Basismodell zurückgesetzt; „Key prüfen“ warnt davor. Lehnt Gemini Audio im Hintergrund-Modus ab, läuft dieselbe Anfrage einmal als normale Anfrage. |
| 2026-10-07 | Dritter Handy-Test: Hintergrund-Transkription einer 3-s-Aufnahme hing über 7 Minuten bei „Transkribieren“. Ursache von hier nicht feststellbar (CORS für die Abfrage geprüft: in Ordnung). Abhilfe: Gemini-Status und Zeit der letzten Abfrage werden auf der Job-Karte angezeigt; nach Audiolänge + 3 Minuten (mindestens 4) wird der Hintergrund-Auftrag abgebrochen und dieselbe Anfrage direkt gestellt. Zeitüberschreitungen beim Nachfragen zählen als Verbindungsabbruch. |
| 2026-10-07 | Wunsch: Aufnahme bei gesperrtem Bildschirm oder außerhalb der App. Mit einer Web-App auf dem iPhone nicht möglich (iOS pausiert Web-Apps im Hintergrund samt Mikrofon). Stattdessen: Taschen-Modus (schwarzer Bildschirm, App bleibt offen, Wake Lock, Doppeltipp zum Beenden), Hinweis mit der Dauer, die die App im Hintergrund war, und „Speichern und transkribieren“, wenn das System die Aufnahme beendet hat. Für echtes Hintergrund-Aufnehmen bliebe nur eine native App (Apple-Entwicklerkonto nötig) oder der Weg über „Sprachmemos“ + Import. |
| 2026-10-07 | Transkription kommt auf dem iPhone weiter nicht durch, Ursache von hier nicht sichtbar (kein Key in der Entwicklungsumgebung). Deshalb: „Fehlersuche“ in den Einstellungen prüft mit einem 2-s-Testton Key, Modell, Upload, direkte Anfrage, JSON-Format und Hintergrund-Auftrag einzeln und zeigt ein kopierbares Protokoll ohne Key. Außerdem Zeitgrenzen für alle Gemini-Anfragen (Client 20 min, Auftrag anlegen 90 s, direkte Anfrage 15 min), damit eine hängende Anfrage nicht alle Jobs blockiert. Achtung: `httpOptions` in `files.upload` ersetzen die Upload-Header des SDK und dürfen dort nicht gesetzt werden. |
| 2026-10-07 | **Transkription läuft über `generateContent` (Streaming) statt Interactions API.** Auf dem iPhone lehnte der Hintergrund-Modus der Interactions API Audio ab, und direkte Interactions-Anfragen brauchten für 6 s Audio mehrere Minuten. Jetzt: `models.generateContentStream` mit Datei aus der Files API, JSON-Schema (`responseJsonSchema`), `thinkingLevel: LOW` (bei Modellen ohne Unterstützung automatisch ohne), Fortschritt in Zeichen auf der Job-Karte, Abbruch wenn 5 min kein erster Text bzw. 2 min kein weiterer kommt. Die App muss während der Transkription offen bleiben. Engine B nutzt weiter die Interactions API (nur dort gibt es `transcription_config`). |
| 2026-10-07 | Aufnahmen bis 8 MB (ca. 10 Minuten) werden nicht mehr über die Files API hochgeladen, sondern direkt in der Transkriptions-Anfrage mitgeschickt (`inlineData`): ein Durchgang weniger. Größere Dateien gehen weiter über die Files API. Die Job-Karte zeigt, wie lange der aktuelle Schritt läuft. |
| 2026-10-08 | Handy-Test: kurze Aufnahmen werden transkribiert, eine importierte 19-min-Datei scheiterte mit „Incomplete JSON segment at the end“: Der Stream endete mitten in einer Nachricht (bekanntes SDK-Problem googleapis/js-genai#1342, auf dem iPhone zusätzlich Verbindungsabbruch im Hintergrund). Jetzt: fertige Segmente werden gerettet und im Job gespeichert, der Rest wird ab dem letzten Segment nachgefragt (3.5). Die App versucht es selbst, sobald sie wieder offen und online ist (bis zu 3 Abbrüche ohne Fortschritt), danach macht „Erneut versuchen“ an derselben Stelle weiter. Erreicht die Antwort das Ausgabelimit (`MAX_TOKENS`), geht es genauso weiter statt mit der Meldung „zu lang“. Die Job-Karte zeigt, bis wohin es schon fertig ist. Baut auf der Stabilisierung vom selben Tag auf (Zeitgrenzen, Anhalten, normale Antwort bei ausgefallenem Streaming). |
| 2026-10-08 | Handy-Test: dieselbe 19-min-Datei scheiterte mit „Der Server hat einen Fehler gemeldet“ (5xx von Gemini). Der Eintrag „429/5xx: Das Gemini-SDK wiederholt selbst“ vom 2026-10-07 stimmte nicht: Das SDK wiederholt nur, wenn `retryOptions` gesetzt ist. Jetzt gesetzt: bis zu 5 Versuche bei 408/429/5xx mit etwa 2, 4, 8, 16 s Pause. Bei 5xx zeigt die Job-Karte Googles Begründung (z. B. „503: The model is overloaded“), und ein eingestelltes Ersatzmodell springt auch bei 5xx ein, nicht nur bei 429. |
| 2026-10-08 | Rückmeldung: Die 19-min-Transkription dauert sehr lange. Ursache von hier nicht sichtbar. Drei Änderungen: (1) `thinkingLevel: MINIMAL` statt `LOW` (Gemini 3 Flash kennt minimal/low/medium/high; eine wörtliche Abschrift braucht kein Nachdenken, das nur den ersten Text verzögert); lehnt ein Modell MINIMAL ab, folgt LOW, dann keine Einstellung. (2) Die Job-Karte zeigt aus dem Stream, wie weit das Transkript ist („bis 07:30 von 19:25“, mit Balken), statt nur Zeichen zu zählen. (3) Schleifenschutz: Kommen über 8 000 Zeichen ohne neues Segment, hängt Gemini in einer Wiederholung; die Antwort wird beendet und ab dem letzten guten Segment fortgesetzt (3.5). |
| 2026-10-07 | Optik: Nutzer wünschen ein schöneres Design. Regel 11 („Funktion vor Optik“) gilt damit nicht mehr absolut. Neues UI mit Tab-Leiste, Rekorder mit Pegelanzeige, Karten im Verlauf, Sprecherfarben. Systemschriften, keine externen Fonts (offline). |

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
