/* Rechtstexte: Impressum, Datenschutzerklärung, Nutzungsbedingungen.
 *
 * ▶ BITTE NUR DEN BLOCK „FSP_LEGAL“ AUSFÜLLEN – die Texte setzen die Angaben automatisch ein.
 * Hinweis: Diese Texte sind eine auf die App zugeschnittene Vorlage und keine Rechtsberatung.
 * Vor dem Start bitte von einer Rechtsanwältin/einem Rechtsanwalt oder einem Generator
 * (z. B. eRecht24, Datenschutz-Generator.de) prüfen lassen.
 */
window.FSP_LEGAL = {
  name: "Kürsat Cinar",
  street: "",            // z. B. "Musterstraße 1"
  city: "",              // z. B. "12345 Musterstadt"
  email: "",             // Kontakt-E-Mail für Impressum und Datenschutz
  phone: "",             // optional
  stand: "31.10.2026",   // Datum der letzten Änderung der Texte
};

(function () {
  const L = window.FSP_LEGAL;
  const MISSING = "[bitte ergänzen]";
  const v = (x) => (x && String(x).trim()) || MISSING;
  const year = new Date().getFullYear();

  // Jeder Text: Liste von Abschnitten { h: Überschrift, p: [Absätze; "• …" = Aufzählungspunkt] }
  const texts = {
    impressum: {
      title: "Impressum",
      sections: [
        { h: "Angaben gemäß § 5 DDG", p: [v(L.name), v(L.street), v(L.city)] },
        { h: "Kontakt", p: ["E-Mail: " + v(L.email)].concat(L.phone ? ["Telefon: " + L.phone] : []) },
        { h: "Verantwortlich für den Inhalt", p: [v(L.name) + ", Anschrift wie oben."] },
        { h: "Urheberrecht", p: [
          `© ${year} ${v(L.name)}. Alle Rechte vorbehalten.`,
          "Die App „Fahrstundenplaner“ – Programmcode, Gestaltung, Logo und Texte – ist urheberrechtlich geschützt. Vervielfältigung, Bearbeitung, Verbreitung oder jede Verwertung außerhalb der bestimmungsgemäßen Nutzung bedürfen der vorherigen schriftlichen Zustimmung des Urhebers. Das gilt auch dann, wenn der Programmcode öffentlich einsehbar ist.",
        ] },
        { h: "Haftung für Links", p: ["Die App enthält Links zu externen Diensten (z. B. WhatsApp). Für deren Inhalte sind ausschließlich die jeweiligen Anbieter verantwortlich."] },
      ],
    },

    datenschutz: {
      title: "Datenschutzerklärung",
      sections: [
        { h: "1. Überblick", p: [
          "Der „Fahrstundenplaner“ ist eine Web-App, mit der Fahrlehrerinnen und Fahrlehrer Fahrstunden anbieten und verwalten und Fahrschülerinnen und Fahrschüler Fahrstunden anfragen. Wir verarbeiten nur die Daten, die dafür nötig sind. Es gibt keine Werbung, kein Tracking und keine Analyse-Cookies.",
        ] },
        { h: "2. Verantwortliche", p: [
          `Betreiber der App: ${v(L.name)}, ${v(L.street)}, ${v(L.city)}, E-Mail: ${v(L.email)}.`,
          "Verantwortlich für die Daten der Fahrschülerinnen und Fahrschüler ist jeweils die Fahrlehrerin bzw. der Fahrlehrer, bei der/dem sie sich registriert haben. Soweit andere Fahrlehrer die App nutzen, verarbeitet der Betreiber deren Schülerdaten in deren Auftrag (Auftragsverarbeitung, Art. 28 DSGVO) und hat selbst keinen Einblick in diese Daten.",
        ] },
        { h: "3. Welche Daten wir verarbeiten", p: [
          "• Konto: Vor- und Nachname, E-Mail-Adresse, Passwort (nur verschlüsselt gespeichert, für niemanden lesbar).",
          "• Ausbildungsangaben: Führerscheinklasse (B, B197, B Automatik), Angabe „Umschreiber“, WhatsApp-Nummer.",
          "• Angabe „Sehhilfe“ (Brille/Kontaktlinsen): Dies ist ein Gesundheitsdatum. Es wird nur mit deiner ausdrücklichen Einwilligung gespeichert (siehe Nr. 4).",
          "• Fahrstunden: Termine, Anfragen, Zusagen und Absagen, gefahrene Minuten, Art der Fahrt (z. B. Überland, Autobahn, Nacht), Absagegründe, Fehlstunden sowie Nachrichten zwischen Schüler und Fahrlehrer.",
          "• Technisch: Beim Aufruf der Seite verarbeiten die Server unserer Dienstleister deine IP-Adresse, Datum/Uhrzeit und Browser-Angaben, um die Seite auszuliefern und abzusichern.",
        ] },
        { h: "4. Zwecke und Rechtsgrundlagen", p: [
          "• Planung, Durchführung und Nachweis der Fahrausbildung sowie Abrechnung von Fahrstunden und Fehlstunden: Art. 6 Abs. 1 lit. b DSGVO (Vertrag bzw. vorvertragliche Maßnahmen).",
          "• Aufbewahrung, soweit gesetzlich vorgeschrieben (z. B. Ausbildungs- und steuerliche Nachweise): Art. 6 Abs. 1 lit. c DSGVO.",
          "• Angabe „Sehhilfe“: ausdrückliche Einwilligung, Art. 9 Abs. 2 lit. a DSGVO. Zweck: damit die Fahrlehrerin/der Fahrlehrer an die vorgeschriebene Sehhilfe erinnern kann. Die Einwilligung ist freiwillig und kann jederzeit widerrufen werden – einfach im Profil den Haken entfernen.",
          "• Sicherheit und Betrieb der App (Server-Protokolle): Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem sicheren Betrieb).",
        ] },
        { h: "5. Wer die Daten sieht", p: [
          "• Deine Fahrlehrerin/dein Fahrlehrer sieht deine Daten und Fahrstunden. Andere Fahrlehrer und andere Schüler sehen sie nicht; bei belegten Terminen sehen andere Schüler weder Namen noch Details.",
          "• Der Betreiber hat technisch keinen Einblick in die Schülerdaten anderer Fahrlehrer.",
          "• Eine Weitergabe an Dritte zu Werbezwecken findet nicht statt.",
        ] },
        { h: "6. Dienstleister (Auftragsverarbeiter)", p: [
          "• Supabase (Supabase Inc., USA) – Datenbank und Anmeldung. Die Daten werden in einem Rechenzentrum in Frankfurt am Main (EU) gespeichert. Mit Supabase besteht ein Auftragsverarbeitungsvertrag; für mögliche Zugriffe aus den USA gelten die EU-Standardvertragsklauseln.",
          "• GitHub Pages (GitHub Inc., USA) – stellt die Webseite bereit. Dabei wird die IP-Adresse verarbeitet. Eine Übermittlung in die USA ist möglich; sie erfolgt auf Grundlage des EU-US Data Privacy Framework bzw. der Standardvertragsklauseln.",
          "• jsDelivr und cdnjs (Content-Delivery-Netzwerke) – liefern Programmbibliotheken (Datenbank-Anbindung, QR-Code) aus. Dabei wird die IP-Adresse an den jeweiligen Anbieter übertragen.",
          "• WhatsApp (WhatsApp Ireland Ltd./Meta): Die App sendet selbst keine Daten an WhatsApp. Nur wenn du einen WhatsApp-Knopf antippst, öffnet sich WhatsApp mit einem vorbereiteten Text; dann gelten die Datenschutzbestimmungen von WhatsApp.",
          "• E-Mail: Für „Passwort vergessen“ und ggf. die Bestätigung der E-Mail-Adresse versendet Supabase E-Mails an dich.",
        ] },
        { h: "7. Speicherung im Browser", p: [
          "Die App speichert im Speicher deines Browsers (Local Storage) deine Anmeldung, damit du angemeldet bleibst, sowie kleine Merkhilfen (z. B. wann du zuletzt nachgesehen hast). Das ist für die Funktion technisch erforderlich (§ 25 Abs. 2 TDDDG). Tracking- oder Werbe-Cookies werden nicht verwendet.",
        ] },
        { h: "8. Speicherdauer", p: [
          "Deine Daten werden gespeichert, solange dein Konto besteht. Nach Ende der Ausbildung kann dein Fahrlehrer den Zugang sperren oder dein Konto mit allen Daten löschen. Daten, die gesetzlichen Aufbewahrungspflichten unterliegen, werden bis zum Ablauf dieser Fristen aufbewahrt und danach gelöscht. Server-Protokolle der Dienstleister werden nach kurzer Zeit automatisch gelöscht.",
        ] },
        { h: "9. Deine Rechte", p: [
          "Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Eine Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3).",
          "Viele Angaben kannst du selbst unter „Profil“ ändern und deine Fahrstunden jederzeit als Datei exportieren. Für alles Weitere wende dich an deinen Fahrlehrer oder an " + v(L.email) + ".",
          "Du hast außerdem das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, z. B. bei der Behörde deines Bundeslandes.",
        ] },
        { h: "10. Sicherheit", p: [
          "Die Verbindung ist verschlüsselt (HTTPS). Passwörter werden nur verschlüsselt gespeichert. Zugriffsregeln in der Datenbank stellen sicher, dass jede Person nur die Daten sieht, die sie sehen darf.",
        ] },
        { h: "11. Änderungen", p: ["Wir passen diese Datenschutzerklärung an, wenn sich die App oder die Rechtslage ändert. Stand: " + v(L.stand) + "."] },
      ],
    },

    agb: {
      title: "Nutzungsbedingungen (AGB)",
      sections: [
        { h: "1. Geltungsbereich", p: [
          `Diese Bedingungen gelten für die Nutzung der Web-App „Fahrstundenplaner“, betrieben von ${v(L.name)}. Sie regeln die Nutzung der App. Der Ausbildungsvertrag, Preise und Zahlungsbedingungen ergeben sich aus dem Vertrag mit der jeweiligen Fahrschule bzw. dem jeweiligen Fahrlehrer.`,
        ] },
        { h: "2. Registrierung und Freischaltung", p: [
          "• Fahrschülerinnen und Fahrschüler registrieren sich über den Link ihres Fahrlehrers mit wahrheitsgemäßen Angaben.",
          "• Ein Zugang wird erst nach Freischaltung durch den Fahrlehrer nutzbar. Ein Anspruch auf Freischaltung besteht nicht.",
          "• Zugangsdaten sind geheim zu halten und dürfen nicht weitergegeben werden.",
        ] },
        { h: "3. Buchung von Fahrstunden", p: [
          "• Eine Anfrage ist noch keine feste Buchung. Verbindlich wird eine Fahrstunde erst mit der Bestätigung durch den Fahrlehrer.",
          "• Bietet der Fahrlehrer eine Fahrstunde an, wird sie mit der Zusage des Schülers verbindlich.",
          "• Der Fahrlehrer kann Beginn und Dauer in Absprache anpassen; die Änderung wird in der App angezeigt.",
          "• Gebucht werden können nur so viele Fahrstunden gleichzeitig, wie der Fahrlehrer freigibt.",
        ] },
        { h: "4. Absage und Fehlstunden", p: [
          "• Bestätigte Fahrstunden können bis zum Vortag, 18:00 Uhr, kostenfrei in der App abgesagt werden.",
          "• Bei späterer Absage oder Nichterscheinen gilt die Fahrstunde als Fehlstunde und ist kostenpflichtig. Das gilt auch, wenn eine Fahrstunde erst nach Ablauf dieser Frist gebucht und bestätigt wurde.",
          "• Die Höhe der Kosten für eine Fehlstunde richtet sich nach dem Ausbildungsvertrag bzw. der Preisliste der Fahrschule.",
          "• Bei Krankheit oder anderen wichtigen Gründen entscheidet der Fahrlehrer im Einzelfall.",
        ] },
        { h: "5. Pflichten der Nutzer", p: [
          "• Die App darf nur für die Organisation der Fahrausbildung genutzt werden.",
          "• Es ist untersagt, die App zu stören, Sicherheitsmechanismen zu umgehen oder auf fremde Daten zuzugreifen.",
          "• Nachrichten in der App müssen sachlich sein und dürfen keine Rechte Dritter verletzen.",
        ] },
        { h: "6. Verfügbarkeit", p: [
          "Wir bemühen uns um einen störungsfreien Betrieb, können aber keine ständige Verfügbarkeit zusichern (z. B. bei Wartung oder Störungen der Dienstleister). Im Zweifel gilt die direkte Absprache mit dem Fahrlehrer.",
        ] },
        { h: "7. Sperrung und Löschung", p: [
          "Der Fahrlehrer kann einen Zugang sperren oder löschen, insbesondere nach Ende der Ausbildung oder bei Verstößen gegen diese Bedingungen. Der Betreiber kann Fahrlehrer-Zugänge aus wichtigem Grund sperren.",
        ] },
        { h: "8. Haftung", p: [
          "Die Nutzung der App ist für Fahrschülerinnen und Fahrschüler kostenlos. Der Betreiber haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit. Im Übrigen ist die Haftung – soweit gesetzlich zulässig – auf vorhersehbare, typische Schäden bei Verletzung wesentlicher Pflichten beschränkt.",
        ] },
        { h: "9. Urheberrecht", p: [
          `Die App mit Programmcode, Gestaltung, Logo und Texten ist urheberrechtlich geschützt (© ${year} ${v(L.name)}). Jede Nutzung außerhalb der bestimmungsgemäßen Verwendung bedarf der schriftlichen Zustimmung.`,
        ] },
        { h: "10. Änderungen und Schlussbestimmungen", p: [
          "Wir können diese Bedingungen anpassen; über wesentliche Änderungen wird in der App informiert. Es gilt deutsches Recht. Sollte eine Bestimmung unwirksam sein, bleibt der Rest wirksam. Stand: " + v(L.stand) + ".",
        ] },
      ],
    },
  };

  window.FSP_LEGAL_TEXTS = texts;
  window.FSP_LEGAL_MISSING = ["street", "city", "email"].filter((k) => !(L[k] && String(L[k]).trim()));
  window.FSP_COPYRIGHT = `© ${year} ${L.name}. Alle Rechte vorbehalten.`;
})();
