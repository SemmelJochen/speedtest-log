# Anleitung für das Erstellen der App mit welcher ich mein Internet Speedtest Loggen und Analysieren kann
Grundlegende Regel: Du darfst niemals einen Task überspringen oder auslassen. Du darfst erst anfangen den nächsten Task zu bearbeiten, wenn du den aktuellen Task abgeschlossen hast, inkl. der Überprüfung der Ergebnisse und der Notizen und seiner Subpunkte!! Du darfst allerdings wenn du zu späterem Zeitpunkt merkst dass du etwas besser machen könntest, wieder Tasks zurückspringen und diese verbessen oder wiederholen. Nimmm dir einige Widerholungen Zeit um dinge zu verbssern und teste jeden Schritt aus indem du selber die Anwendung oder den Teil der Anwendung startest und sie ausprobierst (bei UI dann mit playwright mcp server)! Du bist nicht Fertig bis du es geschafft hast nach einem Schritt die Änderungen zu kompilieren und zu testen.

## Task 1 Strategisches Vorgehen
Du wirst innerhalb eines Docker containers gemounted der auf meiner NAS in meinem Netzwerk liegt. Von dort aus musst du dir ein sinnvolles und präzises Vorgehen überlegen mit welchem ich ziverlässig mein Internet Speed testen kann. Es muss in regelmäßigen Abständen die Upload-, Download- und Ping-Daten des Speedtests speichern (z.B. alle 1 Minute). Du solltest die Daten in einer Datenbank speichern, in einem normalisierten Format. Du kannst PostgreSQL. Mir ist wichtig, dass die Messungen zuverlässig sind und die Daten korrekt gespeichert werden. Es sollen die tatsächlichen Geschwindigkeiten der Upload-, Download- und Ping-Daten des Speedtests gespeichert werden und nicht die Geschwindigkeiten, die von der Internetanbieter bereitgestellt werden.


### Task 2.1 Implementierung der Datenbank und des Speedtest Algorithmus
Welche Technologeie du für das Backend verwendest spielt im Prinzip keine Rolle. Du kannst Python, Node.js, PHP oder sogar Go verwenden. Es ist wichtig, dass du eine robuste und präzise Anwendung erstellst, die die Internetverbindung überwacht und die Daten des Speedtests speichert und analysiert. Es soll in Regelmäßigen Abständen die Upload-, Download- und Ping-Daten des Speedtests speichern (z.B. alle 1 Minute). Du solltest die Daten in einer Datenbank speichern, in einem normalisierten Format. Du kannst PostgreSQL. Mir ist wichtig, dass die Messungen zuverlässig sind und die Daten korrekt gespeichert werden. Es sollen die tatsächlichen Geschwindigkeiten der Upload-, Download- und Ping-Daten des Speedtests gespeichert werden und nicht die Geschwindigkeiten, die von der Internetanbieter bereitgestellt werden. Habe hier schonmal die folgedenen Tasks im Blick, sodass du eine technisch sinnvolle Lösung erstellst. Bitte verwende für die Datenbank ein ORM, sodass du die Daten effizient und sicher speichern kannst und migrationen automatisch generiert werden.

### Task 2.2 RESTful API
Nachem erstellen erstellen des Algorithmus solltest du eine CRUD API implementieren, die die Daten für das Frontedn aufarbeitet und bereitstellt. DIese soll im selben Backend implementiert werden.


### Task 3.1 Frontend Architektur
Das Frontend soll eine einfache Benutzeroberfläche bieten, um die Ergebnisse des Speedtests anzuzeigen und zu analysieren. Du kannst HTML, CSS und JavaScript verwenden. Es ist wichtig, dass du eine benutzerfreundliche und intuitive Oberfläche erstellst, die die Daten des Speedtests einfach und übersichtlich darstellt. Du kannst auch eine Datenvisualisierung verwenden, um die Daten grafisch darzustellen. Du musst hierfür Tanstack-Starter, React.js und shadcn-ui verwenden, es sei denn du entscheidest dich dafür PHP zu verwenden, dann soll bitte alles mit [Laravel und React (shadcn, tailwind, etc)](https://github.com/laravel/react-starter-kit) gemacht werden. Für die Datenvisualisierung sollst du die shadcn charts verwenden.


### Task 3.2
Mach dir gedanken welche Visualisierungen interessant sein könnten für die visualisierung der Daten. und erstelle verschiedene Views in einer Art Dashboard.

### Task 4 Infrastruktur
Erstelle eine docker-compose mit den notwendigen services für die Infrastruktur.
