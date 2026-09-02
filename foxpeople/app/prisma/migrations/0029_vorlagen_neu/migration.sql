-- Arbeitsvertrag und Zusatzvereinbarung nach den Word-Vorlagen von Fox & People.
-- Die Texte lagen bisher mit eckigen Klammern zum Ausfüllen in der Datenbank; jetzt stehen dort
-- Platzhalter, die aus Person, Einsatz und Kunde automatisch befüllt werden.
UPDATE "Vertragsvorlage" SET inhalt = '# ARBEITSVERTRAG

**Dienstgeber (DG):** {{firma.rechtstraeger}} (handelnd unter der Marke „{{firma.name}}“)
AUT-{{firma.plz}} {{firma.ort}}, {{firma.strasse}} · {{firma.firmenbuch}}

**Dienstnehmer/in (DN):** {{person.anrede}} {{person.vorname}} {{person.nachname}}
Geburtsdatum: {{person.geburtsdatum}}
{{person.strasse}}, {{person.plz}} {{person.ort}}

## I. Beginn und Dauer des Dienstverhältnisses
1. Das Dienstverhältnis beginnt am {{einsatz.von}} und wird auf unbestimmte Zeit abgeschlossen.
2. Das erste Monat gilt als Probezeit, in der das Dienstverhältnis jederzeit von beiden Vertragsseiten ohne Angabe von Gründen gelöst werden kann.

## II. Kündigungsfrist und Kündigungstermine
1. Nach Ablauf des Probemonats kann das Dienstverhältnis nach den gesetzlichen und kollektivvertraglichen Bestimmungen der Arbeitskräfteüberlassung gekündigt werden.
2. Bei Kündigung durch den Arbeitnehmer betragen die kollektivvertraglichen Kündigungsfristen derzeit nach ununterbrochener Betriebszugehörigkeit bis 24 Monate 2 Wochen, danach 4 Wochen. Kollektivvertraglicher Kündigungstermin ist derzeit das Ende der betrieblichen Arbeitswoche.
3. Bei Kündigung durch den Arbeitgeber betragen die kollektivvertraglichen Kündigungsfristen derzeit nach ununterbrochener Betriebszugehörigkeit bis 12 Monate 3 Wochen, bis 18 Monate 4 Wochen, bis 2 Jahre 6 Wochen, bis 5 Jahre 2 Monate, bis 15 Jahre 3 Monate, bis 25 Jahre 4 Monate und danach 5 Monate. In den ersten 18 Monaten der Betriebszugehörigkeit gilt als Kündigungstermin das Ende der Arbeitswoche, danach der 15. oder Letzte eines jeden Monats. Soweit gesetzliche oder kollektivvertragliche Bestimmungen für den Arbeitgeber eine kürzere Kündigungsfrist oder häufigere Kündigungstermine vorsehen, gelten diese.

## III. Vorgesehene Verwendung / Einsatzbereich
1. Die Verwendung des/der Arbeitnehmer/in ist die Überlassung an Dritte als {{person.verwendung}}. Die Auswahl und der Wechsel des Beschäftigers obliegt ausschließlich dem DG.
2. Der mögliche Einsatzbereich erstreckt sich auf {{einsatz.einsatzbereich}}. Eine Entsendung ins Ausland ist zulässig, wenn der/die Arbeitnehmer/in im Einzelfall seine/ihre Zustimmung erteilt.
3. Der/Die Arbeitnehmer/in wird allen Anweisungen und Handlungsvorschriften in den jeweiligen Beschäftigerbetrieben Folge leisten, sofern dadurch nicht gegen gesetzliche Bestimmungen verstoßen wird. Der/Die Arbeitnehmer/in wird weiters die Arbeitnehmerschutzvorschriften beachten und zur Verfügung gestellte Arbeitskleidung sowie Schutzausrüstung schonend behandeln und nach dem Arbeitseinsatz der empfangsberechtigten Person nachweislich wieder zurückgeben.
4. Während der überlassungsfreien Zeit ist der/die Arbeitnehmer/in verpflichtet, sich während der beim Arbeitgeber üblichen, 38,5 Stunden nicht überschreitenden Normalarbeitszeit, erreichbar zu halten und täglich um 08:00 Uhr im Büro des Arbeitgebers persönlich zu erscheinen.
5. Der/Die Arbeitnehmer/in hat am Einsatzort pünktlich zu erscheinen und seine/ihre Arbeit an diesem zu erbringen. Erscheint der/die Arbeitnehmer/in bei Beginn oder während der Überlassung nicht oder nicht pünktlich am Arbeitsplatz bzw. Einsatzort, hat der/die Arbeitnehmer/in den Arbeitgeber für sämtliche dadurch entstehende Schäden und Nachteile schadlos zu erhalten. Bei Krankheit oder sonstiger Verhinderung hat der/die Arbeitnehmer/in den Arbeitgeber unverzüglich darüber zu verständigen. Wenn der/die Arbeitnehmer/in durch Krankheit an der Erbringung seiner/ihrer Arbeitsleistung verhindert ist, hat der/die Arbeitnehmer/in dem Arbeitgeber ab dem 1. Tag der Verhinderung eine Bestätigung eines österreichischen Arztes oder der Gesundheitskasse vorzulegen. Die Verletzung dieser Verpflichtung kann einen Entlassungsgrund mit Verlust auf Entgeltfortzahlung darstellen. Der/die Arbeitnehmer/in nimmt zur Kenntnis, dass der Beschäftiger dem Arbeitgeber nicht immer eine Verhinderung mitteilt und der/die Arbeitnehmer/in daher nicht davon ausgehen darf, dass der Arbeitgeber bereits über die Verhinderung informiert ist.

## IV. Einstufung
Die Einstufung des/der Arbeitnehmer/in erfolgt laut Kollektivvertrag für das Gewerbe der Arbeitskräfteüberlassung – {{person.gruppe}} einvernehmlich in die Beschäftigungsgruppe {{person.beschaeftigungsgruppe}}. Er/Sie erklärt, dass sämtliche für die Einstufung erforderliche Unterlagen (LAP, Zeugnisse, Zertifikate) vollständig und richtig dem Arbeitgeber vorgelegt wurden.

## V. Entlohnung
1. Der Mindeststundenlohn beträgt laut Kollektivvertrag für das Gewerbe der Arbeitskräfteüberlassung EUR {{person.stundenlohn}} brutto pro Stunde.
2. Während der Überlassung besteht - falls höher - Anspruch auf den kollektivvertraglichen Mindestlohn laut Kollektivvertrag des Beschäftiger-Betriebes, in bestimmten Branchen mit Zuschlägen.
3. Die Sonderzahlungen, insbesondere Urlaubszuschuss und Weihnachtsremuneration, gebührt laut den Bestimmungen des Kollektivvertrags für das Gewerbe der Arbeitskräfteüberlassung.
4. Alle Entgeltzahlungen erfolgen monatlich im Nachhinein bis spätestens zum 15. eines Folgemonats auf das Konto des/der Arbeitnehmer/in.
5. Macht der Arbeitgeber über die gesetzlich, kollektivvertraglich oder vertraglich geregelten Entgeltansprüche hinausgehende Zuwendungen an den/die Arbeitnehmer/in, anerkennt diese/r den freiwilligen, unverbindlichen und jederzeit widerrufbaren Charakter solcher Zuwendungen und erklärt, ausdrücklich darauf zu verzichten, aus einer Wiederholung derartiger Zuwendungen einen Rechtsanspruch auf die Auszahlung eines solchen Betrages oder überhaupt einer Zuwendung in Folgeperioden abzuleiten.

## VI. Erholungsurlaub
Der Urlaubsanspruch richtet sich nach den Bestimmungen des Urlaubsgesetzes und nach dem anzuwendenden Kollektivvertrag. Der Urlaubsanspruch des/der Arbeitnehmer/in beträgt {{person.urlaubsanspruch}} Arbeitstage pro Jahr. Der Urlaubsverbrauch ist mit dem Arbeitgeber schriftlich zu vereinbaren und wird stundenweise abgerechnet.

## VII. Arbeitszeit und Überstunden
1. Die Normalarbeitszeit des/der Arbeitnehmer/in ist {{person.wochenstunden}} h/Woche.
2. Die Einteilung der Arbeitszeit obliegt dem Arbeitgeber bzw. dem Beschäftiger. Eine Änderung der Arbeitszeit bleibt vorbehalten.
3. Der/Die Arbeitnehmer verpflichtet sich, im gesetzlichen bzw. kollektivvertraglichen Rahmen, angeordnete Mehr- und Überstunden zu leisten.
4. Die Arbeitskraft ist verpflichtet, über ihre tatsächlich erbrachten Arbeitsstunden vollständige Aufzeichnungen mit allen Mehrarbeits-, Fehl- und Zeitausgleichstunden zu führen und diese zum Ende der Arbeitswoche bzw. zum Einsatzende vom Beschäftiger bestätigen zu lassen und wöchentlich dem Arbeitgeber zu übermitteln.
5. Mehr- und Überstunden sind nur auf ausdrückliche Anordnung des Dienstgebers bzw. des Beschäftigers zu leisten.

## VIII. Sonstige Pflichten des/der Arbeitnehmer/in
1. Der/Die Arbeitnehmer/in ist verpflichtet, eine Änderung der Wohnanschrift bzw. eine Änderung seines Lebensmittelpunktes unverzüglich dem Arbeitgeber schriftlich zu melden.
2. Der/Die Arbeitnehmer/in ist verpflichtet, jede Arbeitsverhinderung unter Angabe des Grundes dem Arbeitgeber unverzüglich bekanntzugeben. Eine Bekanntgabe an den Beschäftiger ist NICHT ausreichend. Weiters ist der/die Arbeitnehmer/in verpflichtet, unaufgefordert geeignete Nachweise (etwa eine den gesetzlichen Anforderungen entsprechende Krankenstandsbestätigung) in Schriftform oder per E-Mail an den Arbeitgeber zu übermitteln.
3. Der/die Arbeitnehmer/in ist verpflichtet, Geschäftsgeheimnisse und sonstige vertrauliche Informationen des Arbeitgebers und des Beschäftigers zu wahren und gegenüber jedermann geheim zu halten. Diese Verpflichtung gilt zeitlich unbegrenzt, auch nach Ende des Arbeitsverhältnisses. Für den Fall des Verstoßes gegen die Geheimhaltungsverpflichtung verpflichtet sich der/die Arbeitnehmer/in, eine Konventionalstrafe in Höhe des dreifachen Bruttomonatsentgelts zu bezahlen. Berechnungsgrundlage ist das zuletzt bezogene Brutto-Monatsentgelt inklusive anteiliger Sonderzahlungen und variabler Entgeltsbestandteile. Die Geltendmachung darüberhinausgehender Ansprüche bleibt vorbehalten.

## IX. Konventionalstrafen
Bei termin- oder fristwidriger Lösung des Arbeitsverhältnisses durch den/die Arbeitnehmer/in, bei gerechtfertigter und verschuldeter Entlassung oder unberechtigtem vorzeitigem Austritt, schuldet den/die Arbeitnehmer/in eine sofort fällige und aufrechenbare Vertragsstrafe von zwei Brutto-Monatsentgelten. Berechnungsgrundlage ist das zuletzt bezogene Brutto-Monatsentgelt inklusive anteiliger Sonderzahlungen und variabler Entgeltsbestandteile. Die Geltendmachung darüberhinausgehender Ansprüche bleibt vorbehalten.

## X. Sonstige Bestimmungen
1. Der/Die Arbeitnehmer/in bestätigt, dass die Bestimmungen dieses Arbeitsvertrages mit ihm/ihr vor Unterfertigung erörtert wurden.
2. Der/Die Arbeitnehmer/in bestätigt mit seiner/ihrer Unterschrift, dass ihm/ihr eine Ausfertigung dieses Vertrages ausgehändigt wurde.
3. Der Arbeitgeber leistet Beiträge nach dem BMVG in die Mitarbeitervorsorgekasse. Name und Anschrift der Mitarbeitervorsorgekasse: {{firma.mvk}}

## XI. Digitale Mitarbeiterkommunikation
Der/die Arbeitnehmer/in ist damit einverstanden, dass er/sie Erklärungen des Arbeitgebers verbindlich über die vom Arbeitgeber zur Verfügung gestellte Plattform „{{firma.app}}“ erhält und verpflichtet sich zur entsprechenden Einrichtung und Nutzung auf seinem/ihrem Smartphone. Der Arbeitgeber weist ausdrücklich darauf hin, dass empfohlen wird, die „Push-Mitteilungen“ zu aktivieren, um aktuelle Erklärungen und Benachrichtigungen stets sofort zu erhalten.

{{firma.ort}}, am {{datum}}

Dienstgeber (DG)
Dienstnehmer/in (DN)
' WHERE typ = 'DIENSTVERTRAG';
UPDATE "Vertragsvorlage" SET inhalt = '# ZUSATZVEREINBARUNG
Wichtige Information zu Urlaub, Zeitausgleich und Krankenstand

**Mitarbeiter/in:** {{person.anrede}} {{person.vorname}} {{person.nachname}}
Geburtsdatum: {{person.geburtsdatum}}

Das ist zu tun, wenn Sie Urlaub oder Zeitausgleich benötigen:

Der Zeitpunkt des Urlaubsantrittes oder Zeitausgleichs kann nicht einseitig bestimmt werden, sondern ist zwischen {{firma.rechtstraeger}} ({{firma.name}}) und Ihnen als Arbeitnehmer/in unter Rücksichtnahme auf die Erfordernisse des Beschäftigers (die Firma, wo Sie arbeiten) zu vereinbaren.

Urlaubs- bzw. Zeitausgleichsanträge haben vor Urlaubsantritt genehmigt bei {{firma.name}} aufzuliegen. Nicht bekannt gegebene oder nicht genehmigte Urlaube bzw. Zeitausgleich werden Ihnen als unbezahlter Urlaub verrechnet!

**Erläuterung zu unbezahltem Urlaub:** Während dieser Zeit ruhen die Rechte und Pflichten aus dem Dienstverhältnis; es besteht insbesondere keine Arbeitspflicht des Dienstnehmers bzw. keine Pflicht zur Leistung laufender Bezüge und der aliquoten Sonderzahlungen seitens des Überlassers. Die Zeit des unbezahlten Urlaubes bleibt hinsichtlich aller Rechtsansprüche des Dienstnehmers, die sich nach der Dienstzeit richten, unberücksichtigt.

Das ist zu tun, wenn ein Krankenstand vorliegt:

Wenn Sie krank sind, sind Sie verpflichtet, uns als Ihren Arbeitgeber unverzüglich die Arbeitsverhinderung (= den Krankenstand) mitzuteilen – durch einen Anruf bei {{firma.name}} (Tel. {{firma.telefon}}), am besten vor oder zu Arbeitsbeginn, sowie bei Ihrem Beschäftiger (die Firma, wo Sie arbeiten).

Zusätzlich muss die Krankmeldung bei {{firma.name}} unmittelbar und unaufgefordert vorbeigebracht werden.

Bei unentschuldigtem Fernbleiben, sprich, wenn Sie Ihren Melde- und Nachweispflichten nicht nachkommen, verlieren Sie für die Dauer der Säumnis Ihren Anspruch auf Entgelt – der Lohn bzw. das Entgelt wird nicht bezahlt, solange Sie sich nicht krankgemeldet und/oder uns die nötigen Krankmeldungen gebracht haben.

**Mit Ihrer Unterschrift bestätigen Sie, dass Sie die oben angeführten Punkte gelesen und zur Kenntnis genommen haben.**

{{firma.ort}}, am {{datum}}

Unterschrift Dienstnehmer/in (DN)
' WHERE typ = 'ZUSATZVEREINBARUNG';

-- Einen eigenen Überlassungsvertrag an den Kunden brauchen wir nicht: Die Überlassung ist über den
-- Rahmenvertrag und das Angebot geregelt, die Mitteilung nach § 12 AÜG geht an den Mitarbeiter.
DELETE FROM "Vertragsvorlage" WHERE typ = 'UEBERLASSUNGSVERTRAG';
