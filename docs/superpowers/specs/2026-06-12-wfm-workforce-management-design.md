# Workforce-Management-Tool – Design-Spezifikation

**Datum:** 2026-06-12
**Status:** Entwurf zur Freigabe
**Autor:** Norman Krüger

## 1. Zweck & Kontext

Ein Workforce-Management-Tool (WFM) für ein internes Telefonie-/Callcenter-Team.
Es berechnet aus einem importierten Telefonie-Forecast den Personalbedarf pro Tag
und Zeitintervall, lässt Mitarbeiter Schichten und Pausen wünschen, und gibt dem
Supervisor eine vollständige Übersicht über die Dienstplanung mit Soll/Ist-Abgleich.

**Reifegrad:** MVP mit Backend – echtes Mehrbenutzer-Tool mit Login, Rollen und
zentraler Datenbank, direkt einsetzbar.

### Erfolgskriterien

- Ein Supervisor kann Telefoniezahlen importieren und erhält daraus automatisch
  den Personalbedarf je Intervall (Erlang C).
- Mitarbeiter können pro Tag Früh-/Spätschicht und eine Pausen-Präferenz wünschen.
- Der Supervisor erstellt daraus einen verbindlichen Dienstplan, sieht jederzeit
  Über-/Unterdeckung pro Intervall und veröffentlicht den finalen Plan.
- Pausen werden automatisch so verteilt, dass die Unterdeckung minimiert wird.

## 2. Technologie-Stack

Full-Stack-Monolith in TypeScript – eine App für UI und Server-Logik.

| Schicht          | Technologie                                              |
|------------------|----------------------------------------------------------|
| UI               | Next.js (App Router) + React + TypeScript                |
| API-Schicht      | tRPC (typsicher, ohne manuelle DTO-/REST-Schicht)        |
| Datenbank/ORM    | PostgreSQL + Prisma                                      |
| Authentifizierung| Auth.js (NextAuth), rollenbasiert                        |
| Datei-Import     | `xlsx` (Excel) / `papaparse` (CSV)                       |
| Tests            | Vitest (Unit, Domäne) + Integrationstests (Services/DB)  |

**Echtzeit-Aktualisierung:** Für den MVP per Polling/Revalidation im
Supervisor-Dashboard (Aktualisierung alle wenigen Sekunden). Echte WebSockets
(Socket.IO) sind eine bewusste spätere Erweiterung, kein MVP-Bestandteil.

## 3. Architektur & Modulgrenzen

Eine Next.js-App, intern in klar abgegrenzte Schichten aufgeteilt:

```
wfm-app
├─ app/             React-Seiten & -Komponenten (Mitarbeiter- + Supervisor-Ansichten)
├─ server/          tRPC-Router & Application-Services (orchestrieren Domäne, Transaktionen)
├─ domain/          Fachlogik, framework-frei & unit-testbar:
│   ├─ forecasting/ importierter Forecast (Anrufe + AHT pro Intervall)
│   ├─ staffing/    Erlang-C-Bedarfsrechnung (Kernstück, rein funktional)
│   ├─ scheduling/  Schichtvorlagen, Wünsche, finaler Plan, Coverage
│   └─ breaks/      automatische Pausenverteilung (Heuristik)
├─ infrastructure/  Prisma-Client, Datei-Import (Excel/CSV), Auth-Konfiguration
└─ tests/           Unit (domain) + Integration (server/DB)
```

### Leitprinzipien

- **Die `domain/`-Schicht ist framework-frei.** Erlang C, Bedarf und Pausenlogik
  sind reine TypeScript-Funktionen ohne DB-/Next.js-Abhängigkeit. Der heikelste
  Teil – die Rechenkette – ist dadurch isoliert und deterministisch testbar.
- **`server/`-Services sind die einzige Brücke** zwischen UI und Domäne. Die UI
  ruft nie direkt Prisma oder Domänenlogik auf, sondern ausschließlich tRPC-Endpunkte.
- **Rollen** (`Employee`, `Supervisor`) über Auth.js; Seiten und tRPC-Prozeduren
  per Middleware/Policy abgesichert.
- **Durchgängige Typsicherheit** von der DB (Prisma) über tRPC bis ins React-UI.

### Datenfluss

```
Excel-/CSV-Import → ForecastInterval (DB) → Erlang-C-Service → StaffingRequirement (DB)
   → Supervisor-Planung ⇄ Mitarbeiter-Wünsche → finaler Dienstplan (ShiftAssignment)
   → Pausen-Optimierung (PlannedBreak) → Soll/Ist-Coverage im Dashboard
```

## 4. Datenmodell

Prisma-Modelle, gruppiert nach Domäne.

### Stammdaten & Identität

- **`User`** (Auth.js) – Login, `role` (`EMPLOYEE` | `SUPERVISOR`).
- **`Employee`** – verknüpft mit `User`; `name`, `contractWeeklyHours`, `active`.
  (Keine Skills – es gibt nur eine Warteschlange.)

### Forecast (importiert)

- **`ForecastImport`** – Batch-Metadaten: `fileName`, `importedById`, `importedAt`,
  `periodStart`, `periodEnd`, `status` (`VALIDATED` | `ACTIVE` | `REPLACED`).
- **`ForecastInterval`** – `date`, `intervalStart` (z. B. 08:30), `expectedCalls`,
  `ahtSeconds`. Gehört zu einem `ForecastImport`.

### Bedarfsberechnung

- **`StaffingParameter`** – vom Supervisor gesetzt, versioniert pro Zeitraum:
  `serviceLevelTarget` (z. B. 0.80), `thresholdSeconds` (z. B. 20),
  `shrinkagePercent`, `maxOccupancy`, `intervalLengthMinutes` (15/30/60),
  `openingHours`, `validFrom`.
- **`StaffingRequirement`** – Ergebnis der Erlang-C-Rechnung: `date`,
  `intervalStart`, `requiredAgents`. Abgeleitet aus `ForecastInterval` +
  `StaffingParameter`; wird bei Änderung von Forecast oder Parameter neu berechnet.

### Dienstplanung

- **`ShiftTemplate`** – `name` (Früh/Spät), `startTime`, `endTime`,
  `paidBreakMinutes`, `color`, `active`. In der Praxis genau zwei Vorlagen,
  aber konfigurierbar (Zeiten/Pausenbudget) ohne Codeänderung.
- **`PlanningPeriod`** – Planungshorizont (z. B. eine Kalenderwoche): `startDate`,
  `endDate`, `status` (`DRAFT` → `PUBLISHED`). Klammert Wünsche und finalen Plan.
- **`ShiftWish`** – Mitarbeiter-Wunsch (unverbindlich): `employeeId`, `date`,
  `shiftTemplateId`, `priority`, optional `breakPreference`. Verknüpft mit
  `PlanningPeriod`.
- **`ShiftAssignment`** – verbindliche Zuweisung im finalen Plan: `employeeId`,
  `date`, `shiftTemplateId`, `status` (`PLANNED` | `CONFIRMED`),
  `source` (`FROM_WISH` | `MANUAL`). Eindeutig pro Mitarbeiter + Datum
  (max. eine Schicht pro Tag, keine geteilten Dienste).
- **`PlannedBreak`** – automatisch geplante Pause(n) je `ShiftAssignment`:
  `start`, `durationMinutes`. Vom Pausen-Optimierer erzeugt, vom Supervisor
  manuell überschreibbar.

### Abgeleitete Sicht (zur Laufzeit berechnet, nicht persistiert)

- **Coverage pro Intervall** = anwesende Agenten (aus `ShiftAssignment`, die das
  Intervall abdecken, minus wer gerade `PlannedBreak` hat) gegenüber
  `StaffingRequirement.requiredAgents` → Über-/Unterdeckung. Treibt das Dashboard.

### Schlüssel-Beziehungen

- Ein `ForecastInterval` + zeitgültiger `StaffingParameter` → ein `StaffingRequirement`.
- Ein `Employee` hat pro `PlanningPeriod` viele `ShiftWish`, aber max. eine
  `ShiftAssignment` pro Tag.
- Jede `ShiftAssignment` hat 0..n `PlannedBreak`.

## 5. Fachlogik

### 5.1 Erlang-C-Bedarfsrechnung (`domain/staffing`)

Reine Funktion `requiredAgents(calls, ahtSeconds, params): number`, pro Intervall:

1. **Verkehrslast** `A` (Erlang) = `(calls × ahtSeconds) / intervalLengthSeconds`.
2. **Erlang-C-Formel** liefert die Wartewahrscheinlichkeit `Pw(N)` für `N` Agenten.
3. **Service Level** `SL(N)` = Anteil der Anrufe, die innerhalb `thresholdSeconds`
   bedient werden.
4. `N` wird iterativ erhöht, bis `SL(N) ≥ serviceLevelTarget` **und**
   `occupancy = A/N ≤ maxOccupancy`.
5. **Shrinkage-Aufschlag:** Brutto-Agenten = `ceil(N / (1 − shrinkagePercent))`.
6. Ergebnis → `StaffingRequirement.requiredAgents`.

Deterministisch und gut testbar; Referenzwerte aus der Erlang-C-Literatur dienen
als Testfälle. Erlang A (Abandonment) ist bewusst **nicht** Teil des MVP.

### 5.2 Pausen-Optimierung (`domain/breaks`)

Nach der finalen Schichtzuweisung durch den Supervisor:

- **Eingabe:** alle `ShiftAssignment` der Periode, `StaffingRequirement`,
  Pausenbudget je Schicht (`paidBreakMinutes`), Pausen-Präferenzen der Mitarbeiter.
- **Ziel:** Pausen so in die jeweils gültigen Schichtfenster legen, dass die
  **Unterdeckung pro Intervall minimiert** wird – niemand pausiert in einer Spitze.
- **Verfahren (MVP):** greedy/heuristisch – Pausen intervallweise dorthin legen,
  wo die größte Überdeckung herrscht; Mitarbeiter-Präferenz als Tie-Breaker.
  Transparent und schnell, kein schwerer Solver. Ein echter Optimierungs-Solver
  ist eine spätere Erweiterung.
- **Ausgabe:** `PlannedBreak`-Einträge. Der Supervisor kann einzelne Pausen
  manuell überschreiben.

### 5.3 Coverage-Berechnung (`domain/scheduling`)

Pro Intervall: anwesende Agenten = Anzahl `ShiftAssignment`, die das Intervall
abdecken, minus wer in diesem Intervall `PlannedBreak` hat. Gegenüberstellung zu
`requiredAgents` → farbcodierte Über-/Unterdeckung (grün gedeckt, rot Unterdeckung).

## 6. Abläufe

### 6.1 Telefonie-Import (Supervisor)

1. Upload Excel (`.xlsx`) oder CSV. Erwartete Spalten: `Datum`, `Intervallstart`,
   `Anrufe`, `AHT (Sek.)`.
2. **Validierung vor dem Speichern:** Spalten vorhanden, Intervalle passen zur
   konfigurierten Länge, keine Lücken/Dubletten, plausible Werte. Fehlerhafte
   Zeilen werden mit Zeilennummer und Grund angezeigt.
3. Vorschau (erkannter Zeitraum, Anzahl Intervalle) → Bestätigung →
   `ForecastImport` + `ForecastInterval`. Ein erneuter Import desselben Zeitraums
   markiert den alten als `REPLACED`.
4. Direkt danach läuft die Erlang-C-Rechnung → `StaffingRequirement`.

### 6.2 Planungszyklus

1. Supervisor legt eine `PlanningPeriod` an (z. B. KW) und gibt sie für Wünsche
   frei (`DRAFT`).
2. **Mitarbeiter** wählen pro Tag Früh-/Spätschicht und eine Pausen-Präferenz.
3. **Supervisor** sieht alle Wünsche gegen den Bedarf, weist final zu
   (`ShiftAssignment`) – übernimmt Wünsche oder setzt manuell, schließt
   Unterdeckungen.
4. Pausen-Optimierung läuft → `PlannedBreak`.
5. Supervisor **veröffentlicht** die Periode (`PUBLISHED`); Mitarbeiter sehen
   ihren verbindlichen Plan.

## 7. Oberflächen

### Mitarbeiter

- **Meine Wünsche** – Wochenraster, pro Tag Früh/Spät wählen, Pausen-Präferenz,
  Priorität.
- **Mein Dienstplan** – veröffentlichte Schichten inkl. geplanter Pausen.

### Supervisor

- **Import** – Upload + Validierungsreport.
- **Bedarf** – Forecast vs. berechneter Bedarf pro Intervall (Tabelle + Kurve);
  Parameter (SL, Schwelle, Shrinkage, MaxOccupancy, Intervalllänge) editierbar
  mit Sofort-Neuberechnung.
- **Planung (Kernansicht)** – Wochenraster: Zeilen = Mitarbeiter, Spalten = Tage;
  Wünsche sichtbar, Zuweisung per Klick. Coverage-Leiste pro Intervall
  (grün/rot), die sich live mitaktualisiert.
- **Schichtvorlagen & Parameter** – Früh-/Spät-Zeiten und Pausenbudget pflegen.

### Rollen

- **Mitarbeiter:** eigene Wünsche abgeben, eigenen Plan ansehen.
- **Supervisor:** Import, Parameter, Vorlagen, Planung, Veröffentlichung, Zugriff
  auf alle Daten.

## 8. Querschnittsthemen

### Authentifizierung & Autorisierung

- Auth.js mit Credentials- oder Unternehmens-Provider (MVP: Credentials).
- Rollenbasierte Absicherung über tRPC-Middleware: `employeeProcedure` /
  `supervisorProcedure`. Seitenrouten zusätzlich serverseitig geschützt.

### Fehlerbehandlung

- **Import:** Validierungsfehler werden zeilengenau zurückgemeldet; nichts wird
  bei fehlerhaften Pflichtdaten gespeichert (atomar pro Import).
- **Bedarfsrechnung:** ungültige Parameter (z. B. SL > 1, negative Werte) werden
  vor der Rechnung abgewiesen; nicht-konvergierende Fälle (Last > Kapazität)
  liefern eine klare Meldung statt Endlosschleife (oberes `N`-Limit).
- **Planung:** Doppelzuweisung pro Tag wird durch DB-Constraint + Service-Prüfung
  verhindert; Veröffentlichung einer Periode mit offener Unterdeckung erfordert
  eine bewusste Bestätigung.
- tRPC liefert typisierte Fehler; das UI zeigt verständliche Meldungen.

### Tests

- **Unit (Vitest):** Erlang-C-Funktion gegen Literatur-Referenzwerte;
  Pausen-Heuristik gegen konstruierte Coverage-Szenarien; Coverage-Berechnung.
- **Integration:** Import-Pipeline (Datei → validierte DB-Zeilen),
  Planungs-Services (Wunsch → Zuweisung → Veröffentlichung) gegen Test-DB.
- Die framework-freie `domain/`-Schicht hat die höchste Testabdeckung.

## 9. Nicht im MVP-Umfang (YAGNI)

Bewusst ausgeklammert, um den MVP fokussiert zu halten:

- Mehrere Warteschlangen / Skill-based Routing (eine Warteschlange).
- Erlang A (Abandonment) und mathematisch optimaler Pausen-Solver.
- Geteilte Dienste / mehr als zwei Schichttypen.
- Echte WebSockets (Polling genügt im MVP).
- Tool-seitige Forecast-Erstellung aus Historie (Forecast wird importiert).
- Urlaubs-/Abwesenheitsverwaltung, Lohn-/Zeiterfassung, Mobile-App.

## 10. Offene Punkte / Annahmen

- **Importformat:** Annahme `Datum`, `Intervallstart`, `Anrufe`, `AHT (Sek.)`.
  Exakte Spaltennamen/Reihenfolge werden beim Implementierungsstart fixiert.
- **Intervalllänge:** Standard 30 Minuten, konfigurierbar (15/30/60).
- **Planungshorizont:** wochenweise.
- **Datenbank:** PostgreSQL; via Prisma grundsätzlich austauschbar.
