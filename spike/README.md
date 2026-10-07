# Phase 0 – Spike

Wegwerf-Seite (`index.html`) zum Prüfen der riskanten Annahmen aus `PLAN.md` Abschnitt 7. Kein App-Code, wird in Phase 1 durch die echte App ersetzt.

Öffnen: `https://yunusea12.github.io/TranskribierApp/` (sobald GitHub Pages aktiv ist, siehe unten). Das Mikrofon funktioniert nur über HTTPS, nicht über eine lokal geöffnete Datei auf dem Handy.

## Vorbereitung (einmalig)

1. Im App-Repo: Settings → Pages → Source: **GitHub Actions**. Danach Actions → „Deploy spike to GitHub Pages“ → *Run workflow*.
2. Jeder für sich: privates Repo `mitschrift-vault` mit README anlegen, fine-grained Token nur für dieses Repo (*Contents: Read and write*), Gemini-Key im AI Studio. Siehe `PLAN.md` Abschnitt 8.
3. Auf der Spike-Seite unter „0. Einstellungen“ Key, Token, `owner/mitschrift-vault` und Namen eintragen, „Speichern“.

Die Modell-IDs sind vorausgefüllt (`gemini-3.8-flash`, `gemini-3.5-transcribe`). Wenn eine ID nicht mehr existiert, im AI Studio die aktuelle nachsehen und eintragen.

## Tests

Nach jedem Test im Abschnitt „Protokoll“ auf „Protokoll kopieren“ tippen und das Ergebnis unten eintragen. Keys tauchen im Protokoll nicht auf.

### T1 – Aufnahme auf iPhone und Android
1. „Aufnahme starten“, Mikrofon erlauben, 2 Minuten sprechen.
2. Zwischendurch einmal 10 Sekunden den Bildschirm sperren bzw. die App wechseln.
3. „Stopp“, abspielen: Ist alles da, auch die Zeit mit gesperrtem Bildschirm?
4. Notieren: MIME-Type aus der Zeile unter dem Player, Größe, ob Wake Lock „aktiv“ war, ob nach dem Sperren noch aufgenommen wurde.

### T2 – Upload zur Files API (CORS)
1. Nach T1 „Hochladen“.
2. Erfolg = Zeile mit `name=files/…` und `state=ACTIVE`. Fehlermeldung sonst wörtlich notieren.

### T3 – Engine A gegen Engine B
1. Echte Aufnahme mit 3–5 Personen auf Deutsch, ca. 20 Minuten (gern mit der Sprachmemo-App aufnehmen und importieren).
2. Hochladen, „Erwartete Sprecher“ eintragen, „Engine A starten“, danach „Engine B starten“.
3. Beide mit „als .md“ herunterladen und vergleichen:
   - Stimmt die Sprecherzuordnung? Bleibt S1 über die ganze Aufnahme dieselbe Person?
   - Fehlen Passagen? (Stichproben: 3 Stellen im Audio anhören und im Text suchen.)
   - Passen die Zeitstempel (Stichprobe Anfang, Mitte, Ende)?
   - Dauer und Anzahl `[unverständlich]` aus der Statuszeile.
4. Hinweis: Laut Doku kann Engine B mit Sprechererkennung nur 30 Minuten pro Anfrage. Für den Vergleich also unter 30 Minuten bleiben oder den Fehler notieren.

### T4 – 60 Minuten im Free Tier
1. Eine ca. 60 Minuten lange Datei importieren, hochladen, Engine A starten.
2. Notieren: Läuft es durch? Dauer? Fehler (z. B. 429, abgeschnittenes JSON)? Ist das Transkript bis zum Ende vollständig?

### T5 – Schreiben ins Vault
1. „Testdatei schreiben“, danach bei T3 „A ins Vault schreiben“.
2. Im Vault-Repo auf GitHub prüfen: Sind Umlaute in Dateiname und Inhalt korrekt? Wird die Datei in Obsidian richtig angezeigt?

Danach bei Google „Datei bei Google löschen“ (sonst automatisch nach 48 Stunden) und im Vault den Ordner `Transkripte/_spike/` löschen.

## Ergebnisse

| Test | Gerät / Browser | Ergebnis | Notizen |
|---|---|---|---|
| T1 Aufnahme iPhone | | | MIME: |
| T1 Aufnahme Android | | | MIME: |
| T2 Upload | | | |
| T3 Engine A | | | Dauer, Sprecher, Auslassungen |
| T3 Engine B | | | Dauer, Sprecher, Auslassungen |
| T4 60 min | | | |
| T5 Vault | | | |

## Was der Spike schon gezeigt hat (ohne echte Keys)

- Die Request-Formate für Upload, Engine A (`response_format` mit JSON-Schema) und Engine B (`generation_config.transcription_config`) sind aus den Typen von `@google/genai` 2.27.0 abgeleitet und gegen simulierte Antworten getestet, noch nicht gegen die echte API.
- Engine B liefert Text plus `word_info`-Annotationen (Wort, `speaker` wie `spk_1`, `start_offset` wie `12.3s`), aber keinen Titel. Für Engine B bräuchte es also einen zweiten Request für den Titel.
- Die Antwortstruktur der Interactions API ist im Umbruch (`outputs` in der README, `steps` in den Typen). Der Spike liest beides; die App sollte das ebenfalls tun, bis es sich gesetzt hat.
