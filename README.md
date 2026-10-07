# TranskribierApp („Mitschrift“)

Eine Transkribier-App für Calvin und Yunus: aufnehmen oder Audiodatei importieren → mit Gemini transkribieren (Sprecher, Zeitstempel, Titel) → als Markdown ins eigene Obsidian-Vault-Repo auf GitHub.

- App: https://yunusea12.github.io/TranskribierApp/
- Spike (Phase 0): https://yunusea12.github.io/TranskribierApp/spike/
- Plan und Begründungen: [`PLAN.md`](PLAN.md) · Regeln für die Entwicklung: [`CLAUDE.md`](CLAUDE.md)

## Einrichten (jeder für sich)

1. Privates GitHub-Repo `mitschrift-vault` anlegen, mit README (damit `main` existiert).
2. Fine-grained Token: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens. *Only select repositories* → `mitschrift-vault`, *Contents* → *Read and write*.
3. Gemini-API-Key im Google AI Studio („Get API key“).
4. App-Link auf dem Handy öffnen → „Zum Home-Bildschirm“ (iPhone: Teilen-Menü in Safari; Android: Chrome-Menü → „App installieren“).
5. **In der installierten App** unter „Einstellungen“ Name, Key, Token und `owner/mitschrift-vault` eintragen, „Verbindung testen“.

Keys und Tokens bleiben nur auf dem Gerät. Nie in Chats, Issues oder ins Repo schreiben.

**Ersatzmodell:** Im kostenlosen Kontingent hat jedes Modell ein Tageslimit. Unter „Einstellungen → Ersatzmodell“ kann ein schwächeres Modell (z. B. ein „flash-lite“) gewählt werden, das einspringt, wenn das Limit des Hauptmodells erreicht ist. Nach „Verbindung testen“ schlägt das Feld die Modelle vor, die der eigene Key nutzen darf.

## Handy-Test für Phase 1

1. **Einstellungen:** „Verbindung testen“ zeigt zwei grüne Haken.
2. **Kurze Aufnahme:** 1–2 Minuten mit zwei Personen aufnehmen, „Stopp und transkribieren“. Im Verlauf läuft der Status durch („Wird hochgeladen …“ → „Wird transkribiert …“ → „Wird gespeichert …“), danach steht das Transkript in der Liste.
3. **Transkript öffnen:** Titel, Sprecher, Zeitstempel prüfen. „.md herunterladen“ und „In Zwischenablage kopieren“ ausprobieren.
4. **Import:** Eine Datei aus der Sprachmemo-/Rekorder-App importieren.
5. **Obsidian:** Am PC das Vault-Repo pullen. Die Datei liegt unter `Transkripte/<Jahr>/`.
6. **Fehlerfall:** Flugmodus an, aufnehmen, stoppen. Der Job wartet („offline“). Flugmodus aus: Er startet von selbst.
7. **Absturz:** Während einer Aufnahme die App hart schließen. Beim nächsten Öffnen bietet „Aufnahme“ an, die unterbrochene Aufnahme wiederherzustellen.

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
