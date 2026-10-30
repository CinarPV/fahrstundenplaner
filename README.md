# 🚗 Fahrstundenplaner

Web-App, mit der ein Fahrlehrer Fahrstunden freigibt und Fahrschüler sie per Link anfragen.

## Was die App kann

**Fahrlehrer (Admin)**
- Freie Termine anlegen: Datum, Uhrzeit, Dauer. Die Standarddauer von 90 Minuten ist vorausgefüllt.
- Die Dauer pro Termin in 5- oder 15-Minuten-Schritten ändern oder per Schnellwahl auf 45, 60, 90 oder 135 Minuten setzen.
- Mehrere Termine hintereinander oder wöchentlich wiederholt auf einmal anlegen.
- Anfragen **bestätigen** (verbindlich) oder **ablehnen**. Dabei lassen sich die Uhrzeit anpassen und eine Antwort schreiben, etwa „Ausweis + Brille mitbringen, Treffpunkt Bahnhof“.
- Nach der Fahrstunde die **tatsächliche Fahrzeit** eintragen (Beginn und Ende, die Minuten werden berechnet).
- Übersicht pro Schüler: Anzahl gefahrener Stunden und Gesamtzeit.
- Die Standarddauer unter „Einstellungen“ dauerhaft ändern.

**Fahrschüler**
- Einmal registrieren mit Vor- und Nachname, E-Mail und Passwort.
- Wochenkalender mit den Zuständen **frei**, **angefragt (noch nicht bestätigt)** und **gebucht**. Fremde Namen sieht der Schüler nicht.
- Freien Termin anfragen, mit einer kurzen Nachricht (max. 300 Zeichen).
- Unter „Meine Fahrstunden“ den Status, die Antwort des Fahrlehrers und die gefahrene Zeit sehen.
- Eine noch unbestätigte Anfrage zurückziehen.

---

## Wofür GitHub hier gut ist

| Begriff | Was es ist | Wofür du es nutzt |
|---|---|---|
| **Repository („Repo“)** | Ein Projektordner auf GitHub, der jede Änderung speichert (Versionsgeschichte). | Hier liegt der Code der App sicher in der Cloud. Kaputt gemacht? Jede frühere Version lässt sich wiederherstellen. |
| **GitHub Pages** | Kostenloses Webhosting direkt aus dem Repo. | Macht die App unter einer Adresse wie `https://DEINNAME.github.io/fahrstundenplaner/` erreichbar. Diesen Link bekommen die Schüler. |
| **Commit** | Ein gespeicherter Änderungsschritt mit Beschreibung. | Jede Änderung (z. B. „Farbe geändert“) ist nachvollziehbar. |

Wenn du später etwas ändern willst (Texte, Farben, neue Funktionen), änderst du die Datei im Repo. Das geht direkt auf github.com über das ✏️-Symbol oder mit Claude. GitHub Pages aktualisiert die Webseite danach automatisch in etwa 1 Minute.

> **Wichtig:** Kostenloses GitHub Pages funktioniert nur mit **öffentlichen** Repos. Dann kann jeder den Code lesen, aber **nicht deine Daten**: Termine, Namen und Nachrichten liegen in Supabase und sind durch Zugriffsregeln geschützt. Der Schlüssel in `config.js` ist ein öffentlicher Schlüssel und darf sichtbar sein.

## Wofür Supabase gut ist

Supabase ist die **Datenbank mit Login**. Dort werden gespeichert:
- die Benutzerkonten (E-Mail und Passwort, sicher verschlüsselt),
- die Termine, Anfragen, Nachrichten und Fahrzeiten.

Der kostenlose Plan reicht für eine Fahrschule locker aus. Achtung: Ein kostenloses Projekt wird nach **7 Tagen ohne jede Nutzung** pausiert und lässt sich im Dashboard mit einem Klick wieder starten. Bei regelmäßiger Nutzung passiert das nicht.

---

## Einrichtung (einmalig, ca. 15 Minuten)

### 1. Supabase-Projekt anlegen
1. Auf <https://supabase.com> kostenlos registrieren, zum Beispiel mit deinem GitHub-Konto.
2. **New project** wählen, einen Namen vergeben (`fahrstundenplaner`), ein Datenbank-Passwort festlegen und notieren. Als Region **Frankfurt (eu-central-1)** wählen.
3. Warten, bis das Projekt bereit ist (1–2 Minuten).

### 2. Datenbank einrichten
1. Links im Menü **SQL Editor** öffnen und **New query** wählen.
2. Den kompletten Inhalt der Datei [`supabase/schema.sql`](supabase/schema.sql) hineinkopieren.
3. **Run** klicken. Unten sollte „Success“ stehen.

### 3. Login-Einstellungen
1. Links **Authentication → URL Configuration** öffnen.
2. Bei **Site URL** deine App-Adresse eintragen, z. B. `https://DEINNAME.github.io/fahrstundenplaner/`.
3. Dieselbe Adresse auch unter **Redirect URLs** hinzufügen.

Optional: Unter **Authentication → Providers → Email** lässt sich „Confirm email“ ausschalten. Dann müssen Schüler ihre E-Mail nicht erst bestätigen.

### 4. App mit Supabase verbinden
1. In Supabase **Project Settings → API** öffnen (bzw. **Data API / API Keys**).
2. Die **Project URL** und den **anon public** Key kopieren.
3. Auf GitHub im Repo die Datei `config.js` öffnen, auf ✏️ klicken, beide Werte eintragen und **Commit changes** klicken.

### 5. Dich selbst zum Admin machen
1. Die App öffnen und dich unter „Neu registrieren“ wie ein Schüler registrieren.
2. In Supabase im **SQL Editor** ausführen (mit deiner E-Mail):
   ```sql
   select public.make_admin('deine@email.de');
   ```
3. In der App ab- und wieder anmelden. Oben steht jetzt **Fahrlehrer**, und du siehst die Tabs „Anfragen“, „Schüler“ und „Einstellungen“.

### 6. Link an die Schüler schicken
Unter **Einstellungen → Link für deine Schüler** auf **Kopieren** klicken und den Link per WhatsApp schicken.

---

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Grundgerüst der Seite |
| `app.js` | Die ganze App-Logik (Kalender, Buchen, Bestätigen …) |
| `style.css` | Aussehen (funktioniert auch im Dunkelmodus und auf dem Handy) |
| `config.js` | Verbindung zu Supabase (die zwei Werte aus Schritt 4) |
| `supabase/schema.sql` | Datenbank-Tabellen und Zugriffsregeln |

## Sicherheit in Kürze
- Schüler sehen nur **eigene** Anfragen und Nachrichten. Bei fremden Terminen steht nur „angefragt“ oder „gebucht“.
- Nur der Admin kann Termine anlegen, bestätigen, ablehnen und Fahrzeiten eintragen.
- Ein Termin kann nie doppelt angefragt werden. Das prüft die Datenbank selbst.
