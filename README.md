# 🚗 Easy Fahrstundenplaner

Web-App, mit der Fahrlehrer Fahrstunden freigeben und Fahrschüler sie per Link anfragen. Mehrere Fahrlehrer können die App gemeinsam nutzen, und jeder hat seinen eigenen, getrennten Bereich.

## Was die App kann

**Haupt-Admin (Betreiber der App)**
- Ist selbst auch Fahrlehrer, mit allen Funktionen unten.
- Tab **„Fahrlehrer“**: neue Fahrlehrer-Kollegen anlegen, mit Vorname, Nachname, E-Mail, **Passwort** (wird automatisch erzeugt oder selbst gewählt) und **Link-Kürzel** (z. B. `mehmet`).
- Danach erscheinen fertige **Zugangsdaten zum Kopieren oder Verschicken per WhatsApp**: Anmelde-Adresse, E-Mail, Passwort und der Schüler-Link des Kollegen.
- Fahrlehrer **sperren**, wieder freischalten oder **löschen** (mit allen ihren Schülern und Terminen; zur Sicherheit muss man dafür den Vornamen eintippen).
- Sieht **nicht** die Schüler, Termine oder Nachrichten der anderen Fahrlehrer.

**Jeder Fahrlehrer hat seinen eigenen Bereich**
- Eigene Schüler, eigene Termine, eigene Einstellungen (Standarddauer, Höchstzahl, Name, Handynummer).
- **Eigener Schüler-Link** (z. B. `…/fahrstundenplaner/?l=mehmet`). Wer sich darüber registriert, landet automatisch bei diesem Fahrlehrer.
- Der Link ist jederzeit über den Knopf **„🔗 Schüler-Link“** oben erreichbar: Kopieren, **Teilen**, **per WhatsApp verschicken** oder als **QR-Code** zum Scannen.
- Eigenes **Passwort ändern** unter Einstellungen.

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
- **Nach der Ausbildung:** Den Schüler mit **„🎓 Ausbildung abgeschlossen“** zu den **fertigen Schülern** verschieben (Fahrstunden und Ausbildungsstand bleiben bei dir) oder ihn **endgültig löschen** (Konto und alle Daten werden entfernt, z. B. für den Datenschutz).
- Der Tab „Schüler“ ist in drei Bereiche gegliedert: **Neu angemeldet** (nur sichtbar, wenn jemand auf Freischaltung wartet), **Aktive Schüler** und **Fertige Schüler**.
- Die Standarddauer unter „Einstellungen“ dauerhaft ändern.
- **Freigeben oder zuordnen:** Beim Anlegen wählst du **🟢 Freigeben**, dann können alle Schüler die Termine anfragen, oder **👤 Einem Schüler zuordnen**. Beim Zuordnen tippst du den Schüler in der Liste an, und alle Termine werden direkt bestätigt für ihn eingetragen, z. B. für die Prüfungsvorbereitung die ganze Woche.
- **Höchstzahl pro Schüler:** Standard für alle (Einstellungen). In der Schülerliste setzt ein **Häkchen „Mehr erlauben“** einen Schüler mit einem Klick auf unbegrenzt. Im Schüler-Fenster geht auch eine eigene Anzahl (z. B. 5).
- **Einem Schüler anbieten:** Termine einzeln oder mehrere auf einmal einem bestimmten Schüler **anbieten**. Der Schüler sagt in der App **zu** (dann ist die Fahrstunde verbindlich) oder **ab** (dann ist der Termin wieder frei). Alternativ lassen sie sich direkt **fest eintragen**. Offene Angebote stehen im Tab „Anfragen“, mit einem Knopf zum Erinnern per WhatsApp.
- **📈 Ausbildungsstand pro Schüler:** Im Schüler-Fenster auf „Ausbildungsstand“ tippen. Rund 40 Themen in den Stufen **Grundstufe, Aufbaustufe, Leistungsstufe, Grundfahraufgaben, besondere Ausbildungsfahrten sowie Reife- und Teststufe**. Ein Thema antippen schaltet weiter: offen → **eingeführt** → **geübt** → **sicher**. Fortschrittsbalken pro Stufe und gesamt. Bei Überland, Autobahn und Nacht steht automatisch, wie oft schon gefahren wurde. (Die Themen sind eigene Formulierungen in Anlehnung an den gesetzlichen Ausbildungsplan, keine Kopie der urheberrechtlich geschützten BVF-Diagrammkarte. Eigene Themen und Strecken lassen sich später ergänzen.)
- **Schüler direkt eintragen:** In einem freien Termin einen Schüler auswählen, z. B. nach telefonischer Absprache. Die Fahrstunde ist dann sofort bestätigt.
- **Sonderfahrten:** Beim Abhaken die Art wählen (Übungsfahrt, 🌳 Überland, 🛣️ Autobahn, 🌙 Nacht). Die Zahlen erscheinen pro Schüler in der Übersicht.
- **Schülerdaten bearbeiten** (Name, Klasse, Sehhilfe, Umschreiber, Handynummer).
- **Export** der Fahrstunden eines Schülers als Excel-Datei (CSV) oder zum Drucken bzw. als PDF.
- **Höchstzahl offener Fahrstunden** pro Schüler festlegen (Einstellungen, Standard 3, 0 = unbegrenzt).
- **WhatsApp-Benachrichtigung:** Nach Anbieten, Bestätigen, Ablehnen, Absagen oder Eintragen erscheint ein Knopf mit fertigem Nachrichtentext und Link zur App. Ein Tippen öffnet WhatsApp, dann nur noch auf Senden drücken. (Vollautomatischer Versand wäre nur über die kostenpflichtige WhatsApp Business Platform möglich.)
- Rote Zahlen an den Tabs zeigen offene Anfragen, neue Anmeldungen und neue Absagen.

**Fahrschüler**
- Über den Link des eigenen Fahrlehrers registrieren (der Fahrlehrer steht dann schon fest) mit Vor- und Nachname, Führerscheinklasse (B, B197 oder B Automatik), Sehhilfe ja/nein, Umschreiber ja/nein, E-Mail und Passwort. Danach erscheint „warte auf Freischaltung“, bis der Fahrlehrer zustimmt.
- Der Wochenkalender zeigt **freie** Termine, die **eigenen** Termine und Termine, die jemand anderes **angefragt** hat, die aber **noch nicht bestätigt** sind (ohne Namen). So lohnt es sich, wieder reinzuschauen. Bestätigte Fahrstunden anderer sind unsichtbar.
- Freien Termin anfragen, mit einer kurzen Nachricht (max. 300 Zeichen). Ein Hinweis erklärt: Nach der Bestätigung ist die Fahrstunde verbindlich, und eine Absage nach dem Vortag 18:00 Uhr ist eine kostenpflichtige Fehlstunde.
- Eine bestätigte Fahrstunde mit **„Fahrstunde absagen“** absagen. Dafür muss der Schüler einen kurzen Grund schreiben und einen Haken setzen. Nach der Frist erscheint eine deutliche Warnung, und die Absage wird automatisch als Fehlstunde vermerkt.
- **Ausbildung:** den eigenen Ausbildungsstand ansehen (nur lesen, abhaken kann nur der Fahrlehrer).
- **Profil:** eigene Daten (Name, Klasse, Sehhilfe, Umschreiber, Handynummer) selbst ändern, Passwort ändern.
- **„Neu“-Markierung:** Eine rote Zahl am Tab „Meine Fahrstunden“ zeigt Bestätigungen, Ablehnungen oder abgehakte Stunden seit dem letzten Besuch.
- Eigene Fahrstunden als **Excel-Datei (CSV)** speichern oder **drucken / als PDF** sichern, dazu eine Übersicht der Sonderfahrten.
- Knopf **„💬 Fahrlehrer per WhatsApp“**. Nach einer Absage wird eine fertige Nachricht an den Fahrlehrer angeboten.
- Unter „Meine Fahrstunden“ eine **nummerierte Liste aller gefahrenen Fahrstunden** (Datum, Uhrzeit, Minuten, Gesamtsumme) sehen.
- Unter „Meine Fahrstunden“ den Status, die Antwort des Fahrlehrers, die **gefahrenen Minuten** und **„Abgesagt – krank“** sehen.
- Eine noch unbestätigte Anfrage zurückziehen.
- **Angebote vom Fahrlehrer** erscheinen lila und ganz oben. Der Schüler tippt auf **✓ Zusagen** oder **✗ Absagen**, optional mit kurzer Nachricht. Danach erscheint ein Knopf, mit dem er den Fahrlehrer per WhatsApp informiert.
- Die **WhatsApp-Nummer ist bei der Registrierung Pflicht**, damit der Fahrlehrer den Schüler erreichen kann.

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

**Empfohlen:** Unter **Authentication → Providers → Email** (bzw. **Sign In / Providers**) **„Confirm email“ ausschalten**. Dann müssen Schüler und neue Fahrlehrer ihre E-Mail nicht erst bestätigen. Das ist unproblematisch, weil jeder Schüler ohnehin erst vom Fahrlehrer freigeschaltet werden muss. Außerdem verschickt Supabase im kostenlosen Plan nur wenige Bestätigungs-E-Mails pro Stunde.

### 4. App mit Supabase verbinden
1. In Supabase **Project Settings → API** öffnen (bzw. **Data API / API Keys**).
2. Die **Project URL** und den **anon public** Key kopieren.
3. Auf GitHub im Repo die Datei `config.js` öffnen, auf ✏️ klicken, beide Werte eintragen und **Commit changes** klicken.

### 5. Dich selbst zum Haupt-Admin machen
1. Die App öffnen und dich unter „Neu registrieren“ registrieren. Bei „Dein Fahrlehrer“ steht noch niemand, das ist beim allerersten Mal normal.
2. In Supabase im **SQL Editor** ausführen, mit deiner E-Mail und deinem Wunsch-Kürzel für deinen Schüler-Link:
   ```sql
   select public.make_owner('deine@email.de', 'kuersat');
   ```
3. In der App ab- und wieder anmelden. Oben steht jetzt **Haupt-Admin**, und du siehst zusätzlich den Tab **„Fahrlehrer“**.
4. Unter **Einstellungen** deinen Namen für Schüler und deine Handynummer eintragen.

### 6. Link an die Schüler schicken
Oben auf **„🔗 Schüler-Link“** tippen, dann **Kopieren**, **Teilen**, **per WhatsApp verschicken** oder den **QR-Code** scannen lassen.

### 6b. Weitere Fahrlehrer anlegen (optional)
Im Tab **„Fahrlehrer“** Name, E-Mail und Link-Kürzel eintragen (das Passwort wird automatisch erzeugt) und auf **Fahrlehrer anlegen** tippen. Die fertigen Zugangsdaten schickst du dem Kollegen per WhatsApp. Er meldet sich an, ändert sein Passwort und verschickt dann **seinen eigenen** Schüler-Link.

> **Datenschutz:** Als Betreiber speicherst du auch die Schülerdaten deiner Kollegen, selbst wenn du sie nicht sehen kannst. Mit den Kollegen sollte deshalb eine kurze Vereinbarung zur Auftragsverarbeitung (DSGVO) getroffen werden.

### 7. Schüler freischalten
Neue Registrierungen erscheinen im Tab **Schüler** unter „Neu angemeldet“ (rote Zahl am Tab). Mit **✓ Freischalten** erhält die Person Zugang, mit **Ablehnen & löschen** wird sie entfernt.
Nach der Ausbildung tippst du in der Schülerliste auf den Namen und wählst **🎓 Ausbildung abgeschlossen** oder **Endgültig löschen**.

---

## Vorher lokal testen (ohne GitHub)

Bevor die App online geht, kannst du sie auf deinem Mac ausprobieren:
1. Schritte 1–5 oben durchführen. In Schritt 3 trägst du als Adresse vorerst `http://localhost:8000/` ein.
2. Im Ordner der App starten: `python3 -m http.server 8000`
3. Im Browser `http://localhost:8000/` öffnen.

Wenn du später auf GitHub Pages umziehst, ergänzt du in Supabase (Schritt 3) die echte Adresse.

---

## Handy & Tablet

Die App ist für **Handy und Tablet** gebaut und in Hoch- und Querformat geprüft:
- Nichts ragt über den Bildschirmrand, und die Wochenansicht wird auf dem Handy zu einer Liste.
- Eingabefelder haben mindestens 16 px Schrift. Das iPhone zoomt beim Antippen also nicht ungewollt hinein.
- Alle Knöpfe sind auf Touch-Geräten mindestens 44 px groß, so wie es Apple und Google empfehlen.
- Fenster öffnen sich auf dem Handy als Blatt von unten, über die volle Breite und scrollbar.
- Notch und abgerundete Ecken werden berücksichtigt.

**Als App auf den Startbildschirm:**
- **iPhone (Safari):** Teilen-Knopf antippen, dann **„Zum Home-Bildschirm“** wählen.
- **Android (Chrome):** Menü ⋮ antippen, dann **„App installieren“** bzw. **„Zum Startbildschirm hinzufügen“**.

Die App öffnet sich dann ohne Browser-Leiste, mit eigenem Symbol und dem Namen „Easy Fahrstunden“.

**Nach einem Update:** In `index.html` stehen hinter den Dateien Versionsnummern (`?v=2026-10-31`). Bei jeder Änderung das Datum hochsetzen. Dann laden alle Handys sicher die neue Version.

---

## Rechtliches (Impressum, Datenschutz, AGB, Copyright)

Unten auf jeder Seite stehen **© Kürsat Cinar** und die Links **Impressum**, **Datenschutz** und **Nutzungsbedingungen (AGB)**. Die Texte stehen in der Datei [`legal.js`](legal.js).

**Vor dem Start erledigen:**
1. In `legal.js` oben **Straße, PLZ/Ort und E-Mail** eintragen. Solange etwas fehlt, ist es im Text gelb markiert, und der Haupt-Admin sieht unter Einstellungen einen roten Hinweis.
2. Die Texte von einer Anwältin/einem Anwalt oder einem Generator (z. B. eRecht24, Datenschutz-Generator.de) **prüfen lassen**. Sie sind eine auf die App zugeschnittene Vorlage, aber keine Rechtsberatung.
3. Bei Supabase den **Auftragsverarbeitungsvertrag (DPA)** abschließen. Er lässt sich im Supabase-Dashboard bzw. auf der Supabase-Website anfordern bzw. unterzeichnen.
4. Mit Fahrlehrer-Kollegen eine **Vereinbarung zur Auftragsverarbeitung** treffen (siehe oben).

**In der App eingebaut:**
- Bei der Registrierung müssen Schüler den **Nutzungsbedingungen zustimmen** und bestätigen, dass sie die **Datenschutzerklärung** gelesen haben. Der Zeitpunkt der Zustimmung wird gespeichert.
- Die Angabe **„Sehhilfe“** ist ein Gesundheitsdatum. Sie wird nur mit **ausdrücklicher Einwilligung** gespeichert (eigener Haken). Widerrufen lässt sie sich jederzeit im Profil.
- Die Datei `LICENSE` stellt klar: Der Code ist zwar öffentlich einsehbar, aber **urheberrechtlich geschützt, alle Rechte vorbehalten**.

---

## Datensicherung

**Wo liegen die Daten?** Alle laufenden Daten (Schüler, Termine, Fahrstunden) liegen in **Supabase**, auf einem Server in Frankfurt (Region eu-central-1).

**Sichern per Knopfdruck:** Unter **Einstellungen → 💾 Datensicherung**:
- **„Komplette Sicherung herunterladen“** lädt eine Datei `Sicherung_Easy_Fahrstundenplaner_JJJJ-MM-TT.json` mit **allen deinen Daten** herunter: Schüler, Termine, Buchungen, Fahrzeiten, Notizen und Einstellungen.
- **„Alle Fahrstunden als Excel-Liste“** lädt eine Datei `Alle_Fahrstunden_JJJJ-MM-TT.csv` zum Anschauen und Abrechnen herunter.
- Die Dateien landen auf **dem Gerät, auf dem du den Knopf drückst**: am Mac im Ordner „Downloads“, am iPhone in der App „Dateien“. Am besten zusätzlich in iCloud, Google Drive oder auf einen USB-Stick kopieren.
- Ist die letzte Sicherung auf diesem Gerät **älter als 30 Tage**, erscheint ein rotes **„!“** am Tab „Einstellungen“.
- Jeder Fahrlehrer sichert **nur seine eigenen** Daten.

**Wiederherstellen per Klick:** Unter **Einstellungen → 💾 Datensicherung → „📂 Sicherung wiederherstellen …“** die Sicherungsdatei auswählen. Die App zeigt das Datum und den Inhalt der Sicherung an. Nach Bestätigung mit einem Haken werden die Daten auf diesen Stand zurückgesetzt:
- Gelöschte Termine und Buchungen kommen zurück, geänderte werden auf den Stand der Sicherung gesetzt.
- Was seit der Sicherung neu angelegt wurde, bleibt erhalten.
- Schülerkonten, die inzwischen **gelöscht** wurden, können nicht zurückgeholt werden; deren Buchungen werden übersprungen.
- Man kann nur **die eigene** Sicherung einspielen, nie die eines anderen Fahrlehrers.

## Passwort vergessen?

- **Schüler:** Auf der Anmeldeseite auf **„Passwort vergessen?“** tippen. Sie bekommen eine E-Mail mit einem Link zum Zurücksetzen. Weder der Fahrlehrer noch der Haupt-Admin sieht oder setzt Schüler-Passwörter.
- **Fahrlehrer:** Entweder ebenfalls über „Passwort vergessen?“ oder der **Haupt-Admin** setzt im Tab „Fahrlehrer“ mit **„🔑 Neues Passwort“** ein neues Passwort und schickt es per WhatsApp.
- **Eigenes Passwort ist Pflicht:** Nach einem vom Haupt-Admin vergebenen Passwort (beim ersten Mal oder nach einem Reset) muss der Fahrlehrer bei der nächsten Anmeldung **zuerst ein eigenes Passwort festlegen**, bevor er weiterarbeiten kann. Danach kennt nur er es. Ändern kann er es jederzeit unter **Einstellungen → Passwort ändern**.
- **Lesen** kann Passwörter niemand, auch der Haupt-Admin nicht. Sie sind verschlüsselt gespeichert und können nur **neu gesetzt** werden.
- Hinweis: Im kostenlosen Supabase-Plan können nur wenige E-Mails pro Stunde verschickt werden. Für mehr kann man später einen eigenen E-Mail-Dienst anschließen.

---

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Grundgerüst der Seite |
| `app.js` | Die ganze App-Logik (Kalender, Buchen, Bestätigen …) |
| `style.css` | Aussehen (immer helles Layout, auch auf dem Handy) |
| `manifest.webmanifest`, `icons/` | App-Symbol und Einstellungen für „Zum Startbildschirm hinzufügen“ |
| `logo.svg` | Logo für Kopfzeile und Browser-Tab (kann durch ein eigenes ersetzt werden) |
| `legal.js` | Impressum, Datenschutzerklärung, Nutzungsbedingungen – oben Anschrift/E-Mail eintragen |
| `LICENSE` | Urheberrecht: © Kürsat Cinar, alle Rechte vorbehalten |
| `config.js` | Verbindung zu Supabase (die zwei Werte aus Schritt 4) |
| `supabase/schema.sql` | Datenbank-Tabellen und Zugriffsregeln |

## Sicherheit in Kürze
- Nicht freigeschaltete oder gesperrte Personen sehen **gar nichts**: keine Termine und keine Einstellungen. Das prüft die Datenbank selbst, nicht nur die Oberfläche.
- Schüler sehen nur **eigene** Anfragen und Nachrichten. Belegte Termine anderer bekommen sie gar nicht erst geliefert.
- Nur Fahrlehrer können Termine anlegen, bestätigen, ablehnen und Fahrzeiten eintragen, und zwar **nur für die eigenen Schüler und Termine**.
- **Getrennte Bereiche:** Ein Fahrlehrer sieht niemals Schüler, Termine, Buchungen oder Einstellungen eines anderen Fahrlehrers, auch der Haupt-Admin nicht. Das ist in der Datenbank festgelegt und mit 36 automatischen Tests geprüft.
- Wird ein Fahrlehrer gesperrt, sehen er und alle seine Schüler nichts mehr, bis er wieder freigeschaltet wird.
- Ein Termin kann nie doppelt angefragt werden. Das prüft die Datenbank selbst.
