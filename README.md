# TranskribierApp („Mitschrift“)

Eine Transkribier-App für Calvin und Yunus: aufnehmen oder Audiodatei importieren → mit Gemini transkribieren (Sprecher, Zeitstempel, Titel) → als Notiz in Obsidian speichern.

- App: https://yunusea12.github.io/TranskribierApp/
- Spike (Phase 0): https://yunusea12.github.io/TranskribierApp/spike/
- Plan und Begründungen: [`PLAN.md`](PLAN.md) · Regeln für die Entwicklung: [`CLAUDE.md`](CLAUDE.md)

## Einrichten

Pflicht sind nur zwei Dinge: der eigene **Gemini-API-Key** und die Wahl **Yunus oder Calvin**.

1. App-Link auf dem Handy öffnen und zum Home-Bildschirm hinzufügen (iPhone: Safari → Teilen → „Zum Home-Bildschirm“; Android: Chrome-Menü → „App installieren“).
2. In der App vom Home-Bildschirm: **Einstellungen** → Key holen über den Link (aistudio.google.com/apikey → „Create API key“) → einfügen → **Key prüfen**.
3. Unter „Wer bist du?“ **Yunus** oder **Calvin** antippen.

**Obsidian (einmalig):** Beide haben in Obsidian einen Vault namens **„Mitschrift“**, der zwischen euren Handys synchronisiert wird (z. B. Obsidian Sync mit geteiltem Vault). Die App speichert immer dorthin: Yunus' Notizen nach `Transkripte/Yunus/<Jahr>/`, Calvins nach `Transkripte/Calvin/<Jahr>/`. In Obsidian sieht jeder beide Ordner.

**Ersatzmodell:** Im kostenlosen Kontingent hat jedes Modell ein Tageslimit. Unter „Weitere Einstellungen → Ersatzmodell“ kann ein schwächeres Modell (z. B. „flash-lite“) einspringen, wenn das Limit erreicht ist.

**Updates:** Die App aktualisiert sich selbst, neu hinzufügen ist nie nötig. Eine neue Version wird beim Öffnen geladen und eingespielt, sobald keine Aufnahme läuft. Unter „Einstellungen → App-Version“ steht die aktuelle Version, dort gibt es auch „Nach Update suchen“.

Der Key bleibt nur auf dem Gerät. Nie in Chats, Issues oder ins Repo schreiben.

## Handy-Test

1. **Key:** „Key prüfen“ zeigt grüne Haken.
2. **Kurze Aufnahme:** 1–2 Minuten mit zwei Personen, dann „Fertig“. Im Verlauf laufen die Schritte Hochladen → Transkribieren → Speichern durch.
3. **Obsidian:** Im Verlauf „In Obsidian speichern“ → Obsidian öffnet sich mit der Notiz im Vault „Mitschrift“.
4. **Import:** Eine Datei aus der Sprachmemo-/Rekorder-App importieren.
5. **Offline:** Flugmodus an, aufnehmen, stoppen. Der Job wartet. Flugmodus aus: Er startet von selbst.
6. **Absturz:** Während einer Aufnahme die App hart schließen. Beim nächsten Öffnen bietet „Aufnahme“ an, sie wiederherzustellen.

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
