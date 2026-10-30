# 🚗 Fahrstundenplaner

Web-App, mit der ein Fahrlehrer Fahrstunden freigibt und Fahrschüler sie per Link anfragen.

## Was die App kann

**Fahrlehrer (Admin)**
- Freie Termine anlegen: Datum, Uhrzeit, Dauer. Die Standarddauer von 90 Minuten ist vorausgefüllt.
- Die Dauer pro Termin im 15-Minuten-Takt ändern (−15 / +15) oder per Schnellwahl auf 45, 60, 90 oder 135 Minuten setzen.
- Viele Termine auf einmal anlegen: **Wochentage** ankreuzen (oder Mo–Fr, Mo–Sa, ganze Woche), **Uhrzeiten** festlegen (z. B. 3 Fahrstunden hintereinander mit 15 Min. Pause, dazu einzelne Uhrzeiten) und **für wie viele Wochen** das gelten soll.
- **⧉ Woche kopieren:** Eine fertig geplante Woche mit einem Klick in die nächsten Wochen übernehmen. Termine, die es schon gibt, werden übersprungen.
- Anfragen **bestätigen** (verbindlich) oder **ablehnen**. Dabei lassen sich die Uhrzeit anpassen und eine Antwort schreiben, etwa „Ausweis + Brille mitbringen, Treffpunkt Bahnhof“.
- Nach der Fahrstunde **abhaken**: Die geplanten Minuten stehen schon drin. Bei kürzerer oder längerer Fahrt passt du sie mit −15/−5/+5/+15 an und setzt dann den Haken.
- Nicht gefahren? Den Grund ankreuzen: **🤒 Krank gemeldet**, **🙋 Schüler hat abgesagt** oder **🚫 Ich habe abgesagt**. Dazu kommen eine kurze Notiz und der Haken **„Fehlstunde – kostenpflichtig“**, der nach der Frist automatisch vorausgewählt ist. Ein zukünftiger Termin wird dabei wieder frei.
- Im Tab „Anfragen“ siehst du die **Absagen von Schülern** der letzten 7 Tage, mit Grund und dem Hinweis „Fehlstunde“ oder „rechtzeitig“.
- Bei jedem Schüler siehst du **Klasse, 👓 Sehhilfe und Umschreiber**.
- Übersicht pro Schüler: Anzahl gefahrener Stunden und Gesamtzeit.
- **Neue Anmeldungen freischalten:** Wer sich registriert, sieht erst nach deiner Freischaltung den Kalender.
- **Nach der Ausbildung:** Den Zugang **sperren** (die Fahrstunden-Historie bleibt bei dir) oder den Schüler **endgültig löschen** (Konto und alle Daten werden entfernt, z. B. für den Datenschutz).
- Die Standarddauer unter „Einstellungen“ dauerhaft ändern.
- **Schüler direkt eintragen:** In einem freien Termin einen Schüler auswählen, z. B. nach telefonischer Absprache. Die Fahrstunde ist dann sofort bestätigt.
- **Sonderfahrten:** Beim Abhaken die Art wählen (Übungsfahrt, 🌳 Überland, 🛣️ Autobahn, 🌙 Nacht). Die Zahlen erscheinen pro Schüler in der Übersicht.
- **Schülerdaten bearbeiten** (Name, Klasse, Sehhilfe, Umschreiber, Handynummer).
- **Export** der Fahrstunden eines Schülers als Excel-Datei (CSV) oder zum Drucken bzw. als PDF.
- **Höchstzahl offener Fahrstunden** pro Schüler festlegen (Einstellungen, Standard 3, 0 = unbegrenzt).
- **WhatsApp-Benachrichtigung:** Nach Bestätigen, Ablehnen, Absagen oder Eintragen erscheint ein Knopf mit fertigem Nachrichtentext (wenn der Schüler eine Handynummer hinterlegt hat).
- Rote Zahlen an den Tabs zeigen offene Anfragen, neue Anmeldungen und neue Absagen.

**Fahrschüler**
- Einmal registrieren mit Vor- und Nachname, Führerscheinklasse (B, B197 oder B Automatik), Sehhilfe ja/nein, Umschreiber ja/nein, E-Mail und Passwort. Danach erscheint „warte auf Freischaltung“, bis der Fahrlehrer zustimmt.
- Der Wochenkalender zeigt **freie** Termine, die **eigenen** Termine und Termine, die jemand anderes **angefragt** hat, die aber **noch nicht bestätigt** sind (ohne Namen). So lohnt es sich, wieder reinzuschauen. Bestätigte Fahrstunden anderer sind unsichtbar.
- Freien Termin anfragen, mit einer kurzen Nachricht (max. 300 Zeichen). Ein Hinweis erklärt: Nach der Bestätigung ist die Fahrstunde verbindlich, und eine Absage nach dem Vortag 18:00 Uhr ist eine kostenpflichtige Fehlstunde.
- Eine bestätigte Fahrstunde mit **„Fahrstunde absagen“** absagen. Dafür muss der Schüler einen kurzen Grund schreiben und einen Haken setzen. Nach der Frist erscheint eine deutliche Warnung, und die Absage wird automatisch als Fehlstunde vermerkt.
- **Mein Profil:** eigene Daten (Name, Klasse, Sehhilfe, Umschreiber, Handynummer) selbst ändern.
- **„Neu“-Markierung:** Eine rote Zahl am Tab „Meine Fahrstunden“ zeigt Bestätigungen, Ablehnungen oder abgehakte Stunden seit dem letzten Besuch.
- Eigene Fahrstunden als **Excel-Datei (CSV)** speichern oder **drucken / als PDF** sichern, dazu eine Übersicht der Sonderfahrten.
- Knopf **„💬 Fahrlehrer per WhatsApp“**. Nach einer Absage wird eine fertige Nachricht an den Fahrlehrer angeboten.
- Unter „Meine Fahrstunden“ eine **nummerierte Liste aller gefahrenen Fahrstunden** (Datum, Uhrzeit, Minuten, Gesamtsumme) sehen.
- Unter „Meine Fahrstunden“ den Status, die Antwort des Fahrlehrers, die **gefahrenen Minuten** und **„Abgesagt – krank“** sehen.
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

### 7. Schüler freischalten
Neue Registrierungen erscheinen im Tab **Schüler** unter „Neue Anmeldungen“ (rote Zahl am Tab). Mit **✓ Freischalten** erhält die Person Zugang, mit **Ablehnen & löschen** wird sie entfernt.
Nach der Ausbildung tippst du in der Schülerliste auf den Namen und wählst **Zugang sperren** oder **Endgültig löschen**.

---

## Vorher lokal testen (ohne GitHub)

Bevor die App online geht, kannst du sie auf deinem Mac ausprobieren:
1. Schritte 1–5 oben durchführen. In Schritt 3 trägst du als Adresse vorerst `http://localhost:8000/` ein.
2. Im Ordner der App starten: `python3 -m http.server 8000`
3. Im Browser `http://localhost:8000/` öffnen.

Wenn du später auf GitHub Pages umziehst, ergänzt du in Supabase (Schritt 3) die echte Adresse.

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
- Nicht freigeschaltete oder gesperrte Personen sehen **gar nichts**: keine Termine und keine Einstellungen. Das prüft die Datenbank selbst, nicht nur die Oberfläche.
- Schüler sehen nur **eigene** Anfragen und Nachrichten. Belegte Termine anderer bekommen sie gar nicht erst geliefert.
- Nur der Admin kann Termine anlegen, bestätigen, ablehnen und Fahrzeiten eintragen.
- Ein Termin kann nie doppelt angefragt werden. Das prüft die Datenbank selbst.
