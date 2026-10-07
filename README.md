# TranskribierApp („Mitschrift“)

Eine Transkribier-App für Calvin und Yunus: aufnehmen oder Audiodatei importieren → mit Gemini transkribieren (Sprecher, Zeitstempel, Titel) → als Notiz in Obsidian speichern.

- App: https://yunusea12.github.io/TranskribierApp/
- Spike (Phase 0): https://yunusea12.github.io/TranskribierApp/spike/
- Plan und Begründungen: [`PLAN.md`](PLAN.md) · Regeln für die Entwicklung: [`CLAUDE.md`](CLAUDE.md)

## Einrichten

Nur ein Schritt ist Pflicht: der eigene **Gemini-API-Key**.

1. App-Link auf dem Handy öffnen und zum Home-Bildschirm hinzufügen (iPhone: Safari → Teilen → „Zum Home-Bildschirm“; Android: Chrome-Menü → „App installieren“).
2. In der App vom Home-Bildschirm: **Einstellungen** → Key holen über den Link (aistudio.google.com/apikey → „Create API key“) → einfügen → **Key prüfen**.
3. Unter „Wer nimmt auf?“ den eigenen Namen antippen. Davon hängt der eigene Ordner im Vault ab.

**Obsidian:** Die Obsidian-App muss auf dem Gerät installiert sein. Beim ersten „In Obsidian speichern“ fragt die App einmal nach dem Namen des Vaults. Die Notiz landet im Vault unter `Transkripte/<Name>/<Jahr>/`, also jeder in seinem eigenen Ordner.

**Gemeinsamer Vault:** Wenn Yunus und Calvin in denselben Vault speichern wollen, muss Obsidian diesen Vault zwischen ihren Geräten synchronisieren, z. B. mit Obsidian Sync (geteilter Vault). Die App braucht dafür nur den Vault-Namen.

**Ersatzmodell:** Im kostenlosen Kontingent hat jedes Modell ein Tageslimit. Unter „Weitere Einstellungen → Ersatzmodell“ kann ein schwächeres Modell (z. B. „flash-lite“) einspringen, wenn das Limit erreicht ist.

**Updates:** Die App aktualisiert sich selbst, neu hinzufügen ist nie nötig. Eine neue Version wird beim Öffnen geladen und eingespielt, sobald keine Aufnahme läuft. Unter „Einstellungen → App-Version“ steht die aktuelle Version, dort gibt es auch „Nach Update suchen“.

Der Key bleibt nur auf dem Gerät. Nie in Chats, Issues oder ins Repo schreiben.

## Handy-Test

1. **Key:** „Key prüfen“ zeigt grüne Haken.
2. **Kurze Aufnahme:** 1–2 Minuten mit zwei Personen, dann „Fertig“. Im Verlauf laufen die Schritte Hochladen → Transkribieren → Speichern durch.
3. **Obsidian:** Transkript öffnen → „In Obsidian speichern“ → Vault-Name eintragen → Obsidian öffnet sich mit der Notiz.
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
