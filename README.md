# OJT Console

<p align="center">
  <img src="docs/assets/hero-banner.svg" alt="OJT Console Hero Banner" width="100%" />
</p>

<p align="center">
  <strong>Interne OJT-Webanwendung fuer Training, Sign-off, PDF-Erzeugung und kontrollierten Versand.</strong>
</p>

<p align="center">
  <a href="https://github.com/marcodessi-equinix/OJT-Console"><img src="https://img.shields.io/badge/GitHub-OJT--Console-111827?style=for-the-badge&logo=github" alt="GitHub Repo" /></a>
  <img src="https://img.shields.io/badge/React-19-0f766e?style=for-the-badge&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/Node.js-22-166534?style=for-the-badge&logo=node.js" alt="Node 22" />
  <img src="https://img.shields.io/badge/Podman-Ready-1d4ed8?style=for-the-badge&logo=podman" alt="Podman Ready" />
  <img src="https://img.shields.io/badge/Portainer-Stack-2563eb?style=for-the-badge&logo=portainer" alt="Portainer Stack" />
</p>

## Ueberblick

OJT Console ist eine interne Trainingsanwendung fuer Customer Operations. Die App importiert vorhandene OJT-Dokumente, stellt sie als strukturierte Trainingsmodule bereit, fuehrt Trainer und Mitarbeitende durch den Sign-off-Prozess und erzeugt daraus versandfaehige PDF-Nachweise.

Der Stack ist so vorbereitet, dass du ihn lokal entwickeln, als GitHub-Repository versionieren und anschliessend in Portainer auf einem Podman-Host als Stack deployen kannst.

<p align="center">
  <img src="docs/assets/stack-overview.svg" alt="Architektur der OJT Console" width="100%" />
</p>

## Highlights

| Bereich | Beschreibung |
| --- | --- |
| Dokumentimport | Importiert DOC, DOCX, PDF und TXT aus Englisch- und Deutsch-Ordnern |
| Rollenmodell | Admin-Login und Trainer-Login mit PIN-Flow |
| Trainingsfluss | Dokumente ansehen, Module starten, Fortschritt sichern, Delivery abschliessen |
| PDF-Output | Generiert Nachweise mit Signaturen und Trainingsdaten |
| Versand | SMTP optional, manueller Versandfluss bleibt als Fallback nutzbar |
| Deployment | Vite-Frontend + Express-Backend + Nginx via Compose fuer Podman/Portainer |

## Tech Stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express, TypeScript
- Storage: SQLite via sql.js
- PDF: pdf-lib
- Mail: nodemailer
- Reverse Proxy: Nginx
- Container: Podman / Portainer Stack Deployment

## Repository-Struktur

```text
.
|- backend/
|- frontend/
|- nginx/
|- scripts/
|- docs/assets/
|- compose.yaml
|- docker-compose.yml
|- .env.example
|- stack.env.example
|- README.md
```

## Schnellstart lokal

### Development

```bash
npm install
copy .env.example .env
npm run dev
```

Frontend: `http://localhost:5173`

Backend Health: `http://localhost:4000/api/health`

### Production Build lokal pruefen

```bash
npm run build
```

## OJT-Dokumente

Die App sucht Dokumente standardmaessig in diesen Quellen:

- `English/`
- `German/`
- `OJT English/`
- `OJT German/`
- `OJT C-OPS/English` bzw. `OJT C-OPS/German`
- `OJT F-OPS/English` bzw. `OJT F-OPS/German`
- alternativ ueber `DOCUMENTS_ROOT`, `ENGLISH_DOCUMENTS_ROOT`, `GERMAN_DOCUMENTS_ROOT`

Die echten Trainingsdokumente sollten nicht ins Repository eingecheckt werden. Die wichtigsten lokalen Dokumentordner und Laufzeitdaten sind bereits in [.gitignore](.gitignore) und [.dockerignore](.dockerignore) ausgeschlossen.

## GitHub-Upload

Das Projekt ist inhaltlich fuer GitHub vorbereitet. Vor dem ersten Push solltest du nur noch dein lokales Git-Repository initialisieren und mit deinem Ziel-Repository verbinden:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/marcodessi-equinix/OJT-Console.git
git push -u origin main
```

## Portainer auf Podman

### Empfohlene Variante

Nutze in Portainer einen Stack aus dem Git-Repository oder lade [compose.yaml](compose.yaml) direkt hoch. Fuer Git-Deployments liegt zusaetzlich [docker-compose.yml](docker-compose.yml) im Repo, damit Portainer auch mit dem Standardpfad direkt deployen kann. Fuer die Umgebungsvariablen kannst du [stack.env.example](stack.env.example) als Vorlage nehmen.

### Wichtige Voraussetzungen

- Der Podman-Host sollte schreibbare absolute Linux-Pfade fuer die Quelldokumente haben.
- Die App-Daten liegen jetzt in einer benannten Compose-Volume. Diese wird beim ersten Deploy automatisch angelegt und bei einer spaeteren Neuinstallation wiederverwendet, solange sie in Portainer nicht explizit mit geloescht wird.
- Auf Oracle Linux / RHEL mit SELinux muessen die Bind-Mounts fuer die Quelldokumente weiterhin passend gelabelt sein. Die Compose-Dateien setzen dafuer `selinux: z` auf den Dokument-Mounts.
- Portainer dokumentiert fuer Podman offiziell einen root-basierten Host als Standardfall. Rootless Podman kann funktionieren, ist aber nicht die konservative Standardannahme.
- Bei Git-Stacks wird das komplette Repository auf den Host geklont. Das Repository sollte daher keine grossen Rohdaten oder Submodule enthalten.

### Portainer-Variablen

Mindestens diese Variablen solltest du im Stack setzen:

```env
BACKEND_DATA_VOLUME=ojt-console-backend-data
ENGLISH_DOCUMENTS_SOURCE=/srv/ojt-documents/English
GERMAN_DOCUMENTS_SOURCE=/srv/ojt-documents/German
NPM_NETWORK=nginx-proxy-manager_default
FRONTEND_PORT=9130
ADMIN_IDENTIFIER=admin
ADMIN_NAME=OJT Admin
ADMIN_PIN=1234
```

`BACKEND_DATA_VOLUME` ist die persistente App-Volume fuer SQLite-Datenbank, Mitarbeiter, Trainingsfortschritt, Sessions, Einstellungen, importierte Dokumentkopien und erzeugte PDFs. Mit dem festen Namen bleibt diese Volume auch dann wiederverwendbar, wenn der Stack spaeter geloescht und neu deployt wird.

`NPM_NETWORK` muss dem bereits existierenden gemeinsamen Netzwerk von Nginx Proxy Manager und dieser App entsprechen. Beide Services, `frontend` und `backend`, werden darueber verbunden. Der Backend-Service bleibt trotzdem ohne Host-Port und wird nur intern ueber den Service-Alias `backend:4000` erreicht.

Optional je nach Versand:

```env
MAIL_FROM=ojt-app@example.com
DEFAULT_PRIMARY_RECIPIENT=training-owner@example.com
DEFAULT_CC_ME=
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
```

### Genau das in Portainer eintragen

Wenn du in Portainer einen neuen Stack anlegst, kannst du dich an diesen Feldern orientieren:

1. `Name`
  `ojt-console`
2. `Build method`
  `Git repository` oder alternativ `Web editor` beziehungsweise `Upload` wenn dein Portainer keine Builds aus Git ausfuehren darf.
3. `Repository URL`
  `https://github.com/marcodessi-equinix/OJT-Console.git`
4. `Repository reference`
  `refs/heads/main` oder leer lassen, wenn Portainer standardmaessig den Hauptbranch nutzt.
5. `Compose path`
  `docker-compose.yml`
  Alternativ funktioniert auch `compose.yaml`.
6. `Environment variables`
  Diesen Block direkt uebernehmen und nur Domains, Mailserver und Dokumentpfade auf deinen Server anpassen:

```env
BACKEND_DATA_VOLUME=ojt-console-backend-data
ENGLISH_DOCUMENTS_SOURCE=/srv/ojt-documents/English
GERMAN_DOCUMENTS_SOURCE=/srv/ojt-documents/German
NPM_NETWORK=nginx-proxy-manager_default
FRONTEND_PORT=9130
FRONTEND_ORIGIN=https://fr2-ojtconsole.equinix.com
ADMIN_IDENTIFIER=admin
ADMIN_NAME=OJT Admin
ADMIN_PIN=1234
MAIL_FROM=ojt-app@example.com
DEFAULT_PRIMARY_RECIPIENT=training-owner@example.com
DEFAULT_CC_ME=
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
```

Fuer die einzelnen Werte gilt:

- `BACKEND_DATA_VOLUME`: fester Name der persistenten App-Volume. Diesen Namen spaeter nicht aendern, wenn bestehende Daten erhalten bleiben sollen.
- `ENGLISH_DOCUMENTS_SOURCE`: absoluter Linux-Pfad auf dem Host zu den englischen Quelldokumenten.
- `GERMAN_DOCUMENTS_SOURCE`: absoluter Linux-Pfad auf dem Host zu den deutschen Quelldokumenten.
- `NPM_NETWORK`: Name des bereits existierenden externen Netzwerks von Nginx Proxy Manager.
- `FRONTEND_PORT`: Host-Port, ueber den die App erreichbar ist, falls du sie direkt ohne vorgeschalteten Proxy pruefen willst.
- `FRONTEND_ORIGIN`: oeffentliche URL des Frontends. Fuer lokale Tests kann hier auch `http://<server>:9130` stehen.
- `ADMIN_IDENTIFIER`, `ADMIN_NAME`, `ADMIN_PIN`: initiale Admin-Zugangsdaten.
- `MAIL_FROM` bis `SMTP_PASS`: nur fuellen, wenn der Mailversand direkt aus der App genutzt werden soll.

### Portainer-Schritte ohne Interpretationsspielraum

1. In Portainer `Stacks` oeffnen.
2. `Add stack` waehlen.
3. Als Stack-Namen `ojt-console` eintragen.
4. Entweder `Git repository` waehlen oder die Compose-Datei per Upload/Web Editor einspielen.
5. Bei `Git repository` diese Werte setzen:
  `Repository URL`: `https://github.com/marcodessi-equinix/OJT-Console.git`
  `Compose path`: `docker-compose.yml`
6. Im Bereich `Environment variables` den obigen Variablenblock eintragen.
7. Besonders wichtig: `BACKEND_DATA_VOLUME` immer gleich lassen, zum Beispiel `ojt-console-backend-data`.
8. `Deploy the stack` ausfuehren.
9. Danach pruefen, ob das Volume automatisch angelegt wurde und der Backend-Container gesund startet.
10. Falls du spaeter neu installierst: denselben Stack erneut deployen und denselben Wert fuer `BACKEND_DATA_VOLUME` wiederverwenden.

### Deploy-Ablauf in Portainer

1. Stack anlegen.
2. `Git repository` oder `Upload` waehlen.
3. Repository-URL `https://github.com/marcodessi-equinix/OJT-Console.git` eintragen oder [compose.yaml](compose.yaml) hochladen.
4. Falls Git genutzt wird: Standardpfad `docker-compose.yml` funktioniert direkt. Alternativ kannst du den Compose-Dateipfad explizit auf `compose.yaml` setzen.
5. Umgebungsvariablen aus [stack.env.example](stack.env.example) oder manuell pflegen.
6. Deploy ausfuehren.
7. Anwendung ueber `http://<server>:<FRONTEND_PORT>` aufrufen.

Wenn du den Stack spaeter in Portainer entfernst und erneut installierst, bleiben alle App-Daten erhalten, solange du dieselbe `BACKEND_DATA_VOLUME` verwendest und beim Stack-Loeschen nicht die Option zum Mitloeschen der Volumes aktivierst.

Gespeichert bleiben damit insbesondere:

- Mitarbeiter und Trainer
- Trainingsfortschritt pro Mitarbeiter
- laufende und abgeschlossene Sessions
- Einstellungen der App
- importierte Dokumentkopien im App-Datenspeicher
- erzeugte PDFs und Submission-Daten

### NPM-Topologie

- Nginx Proxy Manager und beide App-Container muessen im selben externen Netzwerk sein.
- NPM sollte auf den Service `frontend` Port `80` zeigen.
- Das Frontend leitet `/api/*` intern an `backend:4000` weiter.
- Der Backend-Service braucht keinen veroeffentlichten Host-Port.

### Was du beim ersten Stack-Deploy beachten musst

- Wenn die Dokumentpfade leer oder falsch sind, startet das Backend jetzt trotzdem. Der automatische Template-Sync wird dann uebersprungen und nur im Backend-Log als Warnung ausgegeben.
- Wenn die Quelldokument-Mounts auf dem Host wegen Berechtigungen oder SELinux nicht zugreifbar sind, startet das Backend weiterhin nicht. Das zeigt sich im Frontend dann als `502 Bad Gateway`.
- Wenn Portainer keine Builds aus dem Git-Repo ausfuehren darf, musst du den Stack per Upload/Web Editor deployen oder spaeter auf vorgebaute Images umstellen.
- Wenn SMTP nicht gesetzt ist, bleibt die App trotzdem nutzbar. Der Versandfluss faellt dann auf den manuellen Prozess zurueck.
- Die SQLite-Datenbank und erzeugte PDFs liegen in der benannten Volume `BACKEND_DATA_VOLUME`. Diese Volume ist der persistente Speicher der App.

<p align="center">
  <img src="docs/assets/portainer-flow.svg" alt="Portainer Deployment Flow" width="100%" />
</p>

## Containerbetrieb lokal

```bash
copy .env.example .env
podman-compose up -d --build
```

Danach ist das Frontend unter `http://localhost:9130` erreichbar.

## Standard-Umgebungsvariablen

Die komplette Vorlage liegt in [.env.example](.env.example). Fuer Portainer ist [stack.env.example](stack.env.example) die bessere Basis.

## Verifikation

Folgendes wurde lokal validiert:

- `npm run build` laeuft erfolgreich durch
- Compose-Datei ist fuer Podman/Portainer-Variablen vorbereitet
- Repo ignoriert Laufzeitdaten, lokale Dokumente und `.env`

Nicht lokal validiert in dieser Windows-Session:

- echter `podman` oder `podman-compose` Lauf
- echter Portainer-Stack-Deploy gegen deinen Zielhost

## Naechste sinnvolle Schritte

1. Git lokal initialisieren und in `https://github.com/marcodessi-equinix/OJT-Console.git` pushen.
2. Auf dem Podman-Server die drei Host-Verzeichnisse anlegen.
3. In Portainer den Stack mit absoluten Host-Pfaden deployen.
4. Nach dem ersten Start `api/health` und den Dokumentimport pruefen.
