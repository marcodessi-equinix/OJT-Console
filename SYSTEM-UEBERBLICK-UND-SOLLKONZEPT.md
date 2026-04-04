# OJT App: System-Ueberblick und Sollkonzept

## Kurzfazit

Die App hat heute bereits viele Bausteine, aber sie bildet den eigentlichen Trainingsprozess nicht als eigenes fachliches Objekt ab.

Das fuehrt zu drei zentralen Problemen:

- Ein begonnenes Training ist nicht sauber im System gespeichert.
- Das Dashboard erkennt Training im Grunde erst ueber gespeicherte Submissions.
- Der Benutzer fuehrt keinen klaren gefuehrten Prozess aus, sondern springt zwischen Mitarbeiter, Dokument, Training und Delivery.

Dadurch wirkt das System unuebersichtlich, obwohl die Einzelteile technisch vorhanden sind.

## 1. Was die App aktuell ist

Die OJT App ist aktuell eine Fullstack-Anwendung mit:

- Frontend in React/Vite/TypeScript
- Backend in Express/TypeScript
- SQLite ueber `sql.js`
- Dokumentimport aus English-/German-Ordnern
- PDF-Erzeugung fuer Trainingsnachweise
- Trainer-/Admin-Login

Die Kernidee heute ist:

1. Dokumente werden als Trainingsvorlagen importiert.
2. Mitarbeiter und Trainer werden verwaltet.
3. Ein Trainer waehlt Mitarbeiter und Dokument aus.
4. Das Training wird im Stepper durchgeklickt.
5. Am Ende wird ein PDF erzeugt und als Submission gespeichert.

## 2. Aktuelle fachliche Bausteine

### 2.1 Templates

Ein OJT-Dokument wird beim Backend-Start oder beim Upload in eine `template`-Struktur uebernommen.

Gespeichert werden unter anderem:

- `id`
- `title`
- `language`
- `team`
- `sourceFile`
- `sections`

Fachlich ist ein Template aktuell die Trainingsvorlage.

### 2.2 Employees

Mitarbeiter und Trainer liegen gemeinsam in einer Tabelle `employees`.

Gespeichert werden unter anderem:

- Stammdaten
- Rolle `employee` oder `trainer`
- Team `C-OPS` oder `F-OPS`
- Trainer-PIN
- Trainer-Signatur

### 2.3 Submissions

Die Tabelle `submissions` ist heute der einzige echte persistente Nachweis eines Trainings im Prozess.

Gespeichert werden unter anderem:

- Mitarbeiter
- Template
- Trainerdaten
- Signaturen
- Section Reviews
- PDF-Pfad
- Versandstatus `draft`, `sent`, `send_failed`

Wichtig: Es gibt aktuell **kein eigenes Objekt fuer eine Training Session**.

## 3. Wie der Ablauf heute technisch zusammenhaengt

### 3.1 Start der App

Beim Backend-Start passiert folgendes:

1. Datenbank initialisieren
2. Trainer Default-PINs setzen
3. Dokumente aus den Dokumentordnern als Templates synchronisieren

Damit ist die App stark dokumentzentriert aufgebaut.

### 3.2 Frontend-Grundlogik

Das Frontend haelt den aktuellen Zustand vor allem in einem grossen zentralen `App.tsx`.

Dort werden gleichzeitig verwaltet:

- aktueller View
- ausgewaehlter Mitarbeiter
- ausgewaehltes Template
- aktuell geladene Template-Details
- Reviews im Training
- Delivery-Formular
- eingeloggter Admin oder Trainer

Die Views sind:

- Dashboard
- Info
- Employees
- Documents
- Training
- Delivery

### 3.3 Was als "aktives Training" gilt

Aus Benutzersicht gibt es bereits so etwas wie ein aktives Training.

Technisch ist das aber heute nur indirekt vorhanden:

- `selectedEmployeeId` liegt im Browser Local Storage
- `selectedTemplateId` liegt im Browser Local Storage
- `reviews` liegen nur im React State
- `currentIndex` liegt nur im React State

Das bedeutet:

- Das Training ist nicht benutzersicher im Backend gespeichert.
- Ein Reload kann Fortschritt verlieren.
- Ein anderer Browser oder anderer Rechner sieht dieses "aktive Training" nicht.

## 4. Warum dein begonnenes Training nicht sauber im Dashboard auftaucht

Das ist kein reiner Anzeige-Bug, sondern ein Modellierungsproblem.

### 4.1 Dashboard-Logik heute

Das Dashboard berechnet Status nicht aus Trainingssessions, sondern aus `submissions`.

Vereinfacht gilt aktuell:

- `not_started`: keine Submission
- `in_progress`: mindestens eine Submission vorhanden, aber noch nicht komplett gesendet
- `ready`: Draft-Submission vorhanden
- `complete`: alle Templates wurden als `sent` gewertet
- `blocked`: `send_failed` vorhanden

### 4.2 Der eigentliche Bruch

Ein Training gilt fuer dich wahrscheinlich schon als gestartet, sobald du:

- einen Mitarbeiter waehlst
- ein Dokument auswaehlst
- ins Training gehst
- vielleicht schon mehrere Punkte bestaetigst

Fuer das System gilt es aber erst spaeter als relevant, naemlich wenn eine Submission gespeichert wurde.

Deshalb entsteht genau das Verhalten, das du beschrieben hast:

- Training angefangen
- aber im Dashboard nicht sichtbar

Das Dashboard ist in diesem Punkt aus heutiger Sicht technisch konsistent, aber fachlich falsch modelliert.

## 5. Hauptprobleme im aktuellen Aufbau

### 5.1 Kein klares Fachobjekt fuer Training

Es fehlt ein Objekt wie:

- `training_session`
- oder `employee_training`
- oder `training_assignment`

Ohne dieses Objekt kann das System nicht sauber beantworten:

- Wer trainiert gerade was?
- Seit wann?
- Mit welchem Fortschritt?
- Mit welchem Trainer?
- Ist das Training pausiert, aktiv oder abgeschlossen?

### 5.2 Auswahl ist global statt pro Mitarbeiter-Training

Aktuell gibt es im Frontend genau eine globale Auswahl fuer:

- Mitarbeiter
- Template

Das ist fuer einen echten Betriebsprozess zu duenn.

Beispiel:

- Mitarbeiter A wird gewaehlt
- Template X wird gewaehlt
- spaeter Mitarbeiter B wird gewaehlt
- die App arbeitet trotzdem weiter mit dem globalen Template-Kontext

Das erhoeht die Verwirrung massiv.

### 5.3 Fortschritt im Training ist nicht persistent

Die einzelnen bestaetigten Trainingsabschnitte werden nicht laufend als Session gespeichert.

Heute werden Reviews im Wesentlichen erst relevant, wenn eine Submission erzeugt wird.

Damit fehlen:

- echtes Fortsetzen
- Zwischenstaende
- nachvollziehbare Historie
- belastbare Dashboard-Kennzahlen

### 5.4 Die Navigation folgt keiner eindeutigen Aufgabe

Die App ist aktuell in technische Bereiche getrennt:

- Mitarbeiter
- Dokumente
- Training
- Delivery

Ein Benutzer denkt aber normalerweise in fachlichen Aufgaben:

- Mitarbeiter auswaehlen
- Training starten
- Training fortsetzen
- Training abschliessen
- Nachweis versenden

Die aktuelle Struktur zwingt Benutzer, das Systemmodell zu verstehen, statt einfach den Arbeitsprozess auszufuehren.

### 5.5 Versandpfad ist fachlich uneindeutig

Die UI hat eine Aktion wie `Send now`, aber im Frontend wird dabei trotzdem zunaechst eine Draft-Submission gespeichert und danach eher ein Outlook-/Mailto-Entwurf vorbereitet.

Das ist fuer Benutzer schwer nachvollziehbar, weil "Senden" nicht unbedingt wirklich "senden" bedeutet.

### 5.6 Dashboard misst die falsche Einheit

Das Dashboard bewertet Mitarbeiter gegen die Gesamtzahl aller Templates.

Das ist nur dann sinnvoll, wenn wirklich jeder Mitarbeiter jedes Template absolvieren muss.

Falls in der Realitaet nur bestimmte Teams, Rollen oder Badge-Pfade relevant sind, ist die Kennzahl fachlich schief.

## 6. Ist-Zustand als Prozessbild

Der aktuelle reale Ablauf ist ungefaehr so:

1. Admin oder Trainer meldet sich an.
2. Mitarbeiter wird ausgewaehlt.
3. In der Dokumentansicht wird ein Template ausgewaehlt.
4. Training wird im Stepper bearbeitet.
5. Nach Abschluss geht es in Delivery.
6. Dort werden Signaturen, Empfaenger und PDF verarbeitet.
7. Erst beim Speichern/Erzeugen einer Submission entsteht ein persistenter Prozessnachweis.

Die fachliche Luecke liegt zwischen Schritt 3 und Schritt 7.

Genau dort muesste eigentlich das eigentliche Training als Session existieren.

## 7. Soll-Modell A: Schlankes, klares Session-Modell

Das ist die beste Option, wenn die bestehende App relativ gezielt verbessert werden soll.

### 7.1 Grundidee

Fuehre ein neues Kernobjekt `training_session` ein.

Beispielhafte Felder:

- `id`
- `employeeId`
- `templateId`
- `trainerId`
- `status`
- `startedAt`
- `lastActivityAt`
- `completedAt`
- `sectionProgressJson`
- `notes`
- `deliveryStatus`
- `submissionId`

### 7.2 Statusmodell

Empfohlene Statuswerte:

- `assigned`
- `in_progress`
- `paused`
- `completed`
- `delivered`
- `cancelled`

### 7.3 Empfohlener Benutzerablauf

1. Trainer waehlt Mitarbeiter.
2. Trainer waehlt passendes Template.
3. System erstellt sofort eine `training_session`.
4. Dashboard zeigt die Session sofort als `in_progress`.
5. Jeder bestaetigte Abschnitt wird laufend in der Session gespeichert.
6. Beim Fortsetzen oeffnet der Trainer genau diese Session wieder.
7. Nach inhaltlichem Abschluss wird die Session auf `completed` gesetzt.
8. Delivery erzeugt aus dieser Session den PDF-Nachweis.
9. Nach Versand oder Versandvorbereitung bekommt die Session `delivered`.

### 7.4 Vorteile

- Dashboard zeigt echte aktive Trainings.
- Fortsetzen funktioniert sauber.
- Verlauf ist nachvollziehbar.
- Training und Delivery sind logisch getrennt, aber verbunden.
- Bestehende Tabellen koennen weitgehend bleiben.

### 7.5 Was sich im UI aendern sollte

Die Navigation sollte fachlich umgebaut werden zu:

- Dashboard
- Mitarbeiter
- Aktive Trainings
- Dokumente
- Abschluss / Delivery

Noch besser waere ein gefuehrter Task-Flow direkt aus dem Mitarbeiterprofil:

1. Mitarbeiter oeffnen
2. Zugeordnetes oder neues Training sehen
3. Starten oder Fortsetzen
4. Abschliessen
5. Nachweis versenden

### 7.6 Empfehlung fuer Dashboard-Karten

Dashboard sollte auf `training_sessions` basieren und mindestens zeigen:

- noch nicht gestartet
- aktiv in Bearbeitung
- inhaltlich abgeschlossen
- Nachweis offen
- versendet

## 8. Soll-Modell B: Badge-/Curriculum-Modell

Das ist die bessere Option, wenn die App langfristig das ganze Bronze-Programm sauber abbilden soll und nicht nur einzelne OJT-Nachweise.

### 8.1 Grundidee

Nicht das einzelne Dokument steht im Zentrum, sondern ein Lernpfad pro Mitarbeiter.

Dann gaebe es zusaetzlich zu Templates weitere fachliche Objekte:

- `program`
- `topic`
- `employee_program_assignment`
- `topic_session`
- `topic_completion`

### 8.2 Beispielhafte Struktur

- Ein Programm: Bronze C-OPS
- Ein Thema: IBX Security
- Ein Thema referenziert ein oder mehrere OJT-Templates
- Ein Mitarbeiter wird einem Programm zugewiesen
- Das Dashboard zeigt Fortschritt im Programm, nicht nur isolierte PDFs

### 8.3 Empfohlener Benutzerablauf

1. Admin weist Mitarbeiter einem Badge-Track zu.
2. System zeigt alle erforderlichen Topics fuer diesen Mitarbeiter.
3. Trainer startet innerhalb eines Topics eine Trainingssession.
4. Session wird gespeichert und fortgefuehrt.
5. Topic wird abgeschlossen.
6. Wenn alle Topics abgeschlossen sind, gilt der Badge-Pfad als fertig.

### 8.4 Vorteile

- Fachlich naeher am echten Trainingsprogramm.
- Dashboards werden aussagekraeftiger.
- Team-, Rollen- und Badge-Logik wird sauber abbildbar.
- Nicht jedes Template muss fuer jeden Mitarbeiter relevant sein.

### 8.5 Nachteile

- Groesserer Umbau.
- Mehr neues Datenmodell.
- Mehr UI- und Backend-Aufwand.

## 9. Welche Option ich empfehlen wuerde

### Kurzfristig

**Option A, also das Session-Modell, ist die richtige naechste Stufe.**

Warum:

- Es loest direkt dein aktuelles Problem.
- Es erklaert Starten, Fortsetzen und Dashboard-Status sauber.
- Es passt relativ gut auf die bestehende Architektur.
- Es vermeidet einen kompletten Neuaufbau.

### Mittelfristig

Falls die App wirklich das komplette Bronze-/Badge-System fuehren soll, sollte spaeter auf Elemente aus Option B erweitert werden.

Der sinnvolle Weg ist also:

1. erst Session-Modell sauber einfuehren
2. spaeter optional Curriculum-/Programm-Modell darueberlegen

## 10. Konkreter Zielablauf fuer die App

Mein Vorschlag fuer den kuenftig klaren Standardprozess:

1. Trainer meldet sich an.
2. Trainer oeffnet Mitarbeiterprofil.
3. System zeigt dort:
   - aktive Trainings
   - pausierte Trainings
   - abgeschlossene Trainings
   - moegliche neue Trainings
4. Trainer klickt `Neues Training starten`.
5. Trainer waehlt Template.
6. System erstellt sofort eine Session.
7. Session erscheint sofort im Dashboard.
8. Training speichert Fortschritt automatisch nach jedem Schritt.
9. `Fortsetzen` oeffnet immer die konkrete Session, nicht nur globalen App-Zustand.
10. `Abschliessen` sperrt den Trainingsinhalt fachlich ab.
11. Delivery erzeugt den Nachweis aus genau dieser Session.
12. Versandstatus wird an der Session sichtbar gemacht.

## 11. Konkrete Struktur, wie alles zusammenhaengen sollte

### Empfohlene Beziehungen

- Ein `employee` kann viele `training_sessions` haben.
- Ein `template` kann in vielen `training_sessions` verwendet werden.
- Eine `training_session` hat genau einen verantwortlichen Trainer.
- Eine `training_session` kann genau eine finale `submission` erzeugen.
- Das Dashboard liest primaer `training_sessions` und nur sekundaer `submissions`.

### Empfohlene Verantwortlichkeiten

- `templates`: Trainingsinhalt
- `employees`: Personen und Rollen
- `training_sessions`: laufender Prozess und Fortschritt
- `submissions`: finaler Nachweis / PDF / Versand
- `settings`: Empfaenger und Systemkonfiguration

## 12. Konkrete fachliche Regeln

Damit die App klar wirkt, sollten diese Regeln gelten:

- Ein Training startet in dem Moment, in dem eine Session erstellt wird.
- Ein Training ist fortsetzbar, solange die Session nicht abgeschlossen oder abgebrochen ist.
- Das Dashboard zeigt Session-Status, nicht nur Versandstatus.
- Ein PDF ist Ergebnis eines Trainings, nicht das Training selbst.
- `Send now` darf nur verwendet werden, wenn wirklich gesendet wird.
- Wenn nur ein E-Mail-Entwurf vorbereitet wird, muss die Aktion auch so heissen.

## 13. Priorisierte Umsetzungsreihenfolge

### Phase 1: Fachliches Modell reparieren

1. Tabelle `training_sessions` einfuehren
2. Backend-Routen fuer Starten, Laden, Fortsetzen, Abschliessen
3. Dashboard auf Sessions umstellen
4. Employee-Ansicht um aktive Sessions erweitern

### Phase 2: UI klarer machen

1. Mitarbeiterprofil als zentralen Einstieg verwenden
2. Starten/Fortsetzen prominent zusammenfassen
3. Documents eher als Bibliothek behandeln, nicht als Hauptprozess
4. Delivery sprachlich und funktional sauber vom Training trennen

### Phase 3: Versand und Reporting aufraeumen

1. echten Versand und E-Mail-Entwurf klar trennen
2. Session-Historie anzeigen
3. Kennzahlen nach Team, Template, Trainer und Status sauber auswerten

## 14. Endbewertung

Die App ist nicht kaputt, aber ihr fachliches Rueckgrat fehlt noch.

Aktuell ist sie vor allem:

- Dokumentverwaltung
- Mitarbeiterverwaltung
- Trainings-Viewer
- PDF-/Delivery-Generator

Was noch fehlt, ist die Schicht dazwischen:

- der echte Trainingsprozess als persistente Session

Sobald diese Schicht eingefuehrt wird, werden die heutigen Probleme fast automatisch deutlich kleiner:

- Dashboard wird plausibel
- Starten und Fortsetzen werden eindeutig
- Benutzer muessen die interne Logik nicht mehr erraten
- das gesamte System wird nachvollziehbar und ruhiger

## 15. Klare Empfehlung

Wenn die App jetzt sinnvoll weiterentwickelt werden soll, dann sollte als naechster grosser Schritt **nicht** zuerst das UI verschoenert werden.

Der wichtigste Schritt ist:

**Ein sauberes Session-Modell fuer laufende Trainings einfuehren und darauf Dashboard, Fortsetzen und Delivery aufbauen.**