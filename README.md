# TranskribierApp („Mitschrift“)

Eine Transkribier-App für Calvin und Yunus: aufnehmen oder Audiodatei importieren → mit Gemini transkribieren (Sprecher, Zeitstempel, Titel) → automatisch im gemeinsamen Speicher ablegen, jeder in seinem Ordner, beide sehen alles.

- App: https://yunusea12.github.io/TranskribierApp/
- Spike (Phase 0): https://yunusea12.github.io/TranskribierApp/spike/
- Plan und Begründungen: [`PLAN.md`](PLAN.md) · Regeln für die Entwicklung: [`CLAUDE.md`](CLAUDE.md)

## Einrichten

In der App braucht jeder nur drei Dinge: den eigenen **Gemini-API-Key**, die Wahl **Yunus oder Calvin** und die Verbindung zum **gemeinsamen Speicher**.

1. App-Link auf dem Handy öffnen und zum Home-Bildschirm hinzufügen (iPhone: Safari → Teilen → „Zum Home-Bildschirm“; Android: Chrome-Menü → „App installieren“).
2. In der App vom Home-Bildschirm: **Einstellungen** → Key holen (aistudio.google.com/apikey → „Create API key“) → einfügen → **Key prüfen**.
3. Unter „Wer bist du?“ **Yunus** oder **Calvin** antippen.
4. **Gemeinsamer Speicher:**
   - **Yunus (einmalig):** „Ich richte ihn ein“ → Link 1 legt das private Repo `mitschrift-daten` an (Name und „Private“ sind vorausgefüllt) → Link 2 erstellt den Schlüssel (Only select repositories → `mitschrift-daten`, Contents: Read and write) → Schlüssel einfügen → „Verbinden“.
   - **Calvin:** Yunus tippt auf „Calvin einladen (QR-Code)“. Calvin tippt in seiner App auf „Einladung scannen“ und hält die Kamera auf den Code. Fertig, kein GitHub-Konto nötig.

Danach landet jedes Transkript automatisch im Speicher: Yunus' unter `Transkripte/Yunus/<Jahr>/`, Calvins unter `Transkripte/Calvin/<Jahr>/`. Im Verlauf sehen beide alles (Filter Alle / Yunus / Calvin).

„Verbinden“ prüft den tatsächlichen Contents-Schreibzugriff des Tokens. Bei einem bestehenden Repo verändert die Prüfung keine Dateien. Ein ganz leeres Repo wird mit einer kleinen `.mitschrift/README.md` initialisiert. Ein falscher Branch muss in den Einstellungen korrigiert werden; die App weicht nicht auf einen anderen Branch aus.

**Obsidian (optional):** Wer die Transkripte in Obsidian lesen will, holt das Repo am PC (z. B. mit GitHub Desktop) und öffnet den Ordner als Vault.

**Ersatzmodell:** Im kostenlosen Kontingent hat jedes Modell ein Tageslimit. Unter „Weitere Einstellungen → Ersatzmodell“ kann ein schwächeres Modell (z. B. „flash-lite“) einspringen, wenn das Limit erreicht ist.

**Updates:** Die App aktualisiert sich selbst, neu hinzufügen ist nie nötig. Eine neue Version wird beim Öffnen geladen und eingespielt, sobald weder Aufnahme noch Verarbeitung laufen. Unter „Einstellungen → App-Version“ steht die aktuelle Version, dort gibt es auch „Nach Update suchen“.

Key und Speicher-Schlüssel bleiben nur auf dem Gerät. Nie in Chats, Issues oder ins Repo schreiben; den QR-Code nicht fotografieren oder verschicken.

## Handy-Test

1. **Key:** „Key prüfen“ zeigt grüne Haken.
2. **Kurze Aufnahme:** 1–2 Minuten mit zwei Personen, dann „Fertig“. Im Verlauf laufen die Schritte Hochladen → Transkribieren → Speichern durch.
3. **Gemeinsam:** Das Transkript erscheint beim anderen im Verlauf (dort „Aktualisieren“ tippen).
4. **Import:** Eine Datei aus der Sprachmemo-/Rekorder-App importieren.
5. **Offline:** Flugmodus an, aufnehmen, stoppen. Der Job wartet. Flugmodus aus: Er startet von selbst.
6. **Absturz:** Während einer Aufnahme die App hart schließen. Beim nächsten Öffnen bietet „Aufnahme“ an, sie wiederherzustellen.
7. **Unterbrechung durch das System:** Eine Aufnahme unterbrechen (z. B. Mikrofon durch Anruf belegt), anschließend „Speichern und transkribieren“. Eine neue Aufnahme wird erst nach dem Sichern oder Verwerfen der bisherigen möglich.
8. **Anhalten:** Während einer längeren Transkription „Verarbeitung anhalten (Audio behalten)“ drücken. „Erneut versuchen“ muss mit derselben gespeicherten Aufnahme funktionieren.

Bitte notieren, was nicht klappt (Gerät, Browser, Fehlermeldung).

## Entwicklung

```bash
npm install
npm run dev      # lokaler Dev-Server
npm run test     # Vitest
npm run lint     # ESLint + TypeScript
npm run build    # Produktions-Build nach dist/
```

Push auf `main` baut, testet und veröffentlicht automatisch auf GitHub Pages.

## Wenn die Verarbeitung hängt

Die App während Upload und Transkription offen lassen. Bei kurzen Aufnahmen wartet sie höchstens 90 Sekunden auf den ersten Text; bei längeren bis zu 5 Minuten. Funktioniert die Streaming-Verbindung nicht, wird einmal eine normale Antwort versucht. Danach erscheint ein Fehler statt endlosem Warten.

„Verarbeitung anhalten (Audio behalten)“ beendet einen hängenden Schritt. Anschließend „Erneut versuchen“ verwenden. Audio und bereits fertige Transkripte bleiben erhalten. Bei Problemen unter Einstellungen → Fehlersuche das Protokoll kopieren; keine Keys verschicken.

Beim optionalen Transcribe-Modell wartet die zusätzliche Titelanfrage höchstens 30 Sekunden. Kommt kein Titel, bleibt der erkannte Text unter „Transkript“ erhalten.

Nach einem App-Update: erst die neue Version anzeigen lassen, dann eine 10-Sekunden-Aufnahme testen, im Verlauf das fertige Transkript öffnen und es auf dem zweiten Gerät aktualisieren. Echte Gemini-Antworten und Aufnahmeverhalten müssen auf dem jeweiligen Handy geprüft werden.
