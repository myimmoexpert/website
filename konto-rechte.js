/* =====================================================================
   konto-rechte.js
   Zwei Betroffenenrechte als fertige Funktionen fuer profil.html:

     ieDatenExport()    – Art. 20 DSGVO, laedt alle Daten als JSON herunter
     ieKontoLoeschen()  – Art. 17 DSGVO, loescht das Konto vollstaendig

   Einbinden in profil.html, nach dem Supabase-Client:
     <script src="konto-rechte.js"></script>

   Die Datei sucht den vorhandenen Supabase-Client selbst. Heisst die
   Variable in deinem Projekt anders, trag sie unten bei KLIENT_NAMEN ein.
   ===================================================================== */
(function () {
  "use strict";

  var KLIENT_NAMEN = ["supabaseClient", "sb", "db", "client", "_supabase", "supabase"];

  function klient() {
    for (var i = 0; i < KLIENT_NAMEN.length; i++) {
      var k = window[KLIENT_NAMEN[i]];
      if (k && k.auth && typeof k.from === "function") return k;
    }
    throw new Error(
      "Supabase-Client nicht gefunden. Bitte den Namen der Variablen in konto-rechte.js eintragen.",
    );
  }

  function melde(text, istFehler) {
    var feld = document.getElementById("ie-konto-meldung");
    if (!feld) { alert(text); return; }
    feld.textContent = text;
    feld.style.display = text ? "block" : "none";
    feld.style.color = istFehler ? "#ef6b6b" : "#9b968c";
  }

  /* ---------- Art. 20: Datenexport ---------------------------------- */

  window.ieDatenExport = async function () {
    var knopf = document.getElementById("ie-export-knopf");
    if (knopf) { knopf.disabled = true; }
    melde("Daten werden zusammengestellt \u2026", false);

    try {
      var k = klient();
      var sitzung = await k.auth.getUser();
      var nutzer = sitzung.data && sitzung.data.user;
      if (!nutzer) throw new Error("Nicht angemeldet.");

      var export_ = {
        hinweis:
          "Export aller zu diesem Konto gespeicherten Daten aus Immo.Expert " +
          "(Art. 20 DSGVO). Dateien im Dokumentenbereich sind hier nur mit " +
          "Pfad aufgefuehrt und einzeln ueber die Anwendung herunterzuladen.",
        erstellt_am: new Date().toISOString(),
        konto: {
          id: nutzer.id,
          email: nutzer.email,
          name: (nutzer.user_metadata && nutzer.user_metadata.name) || null,
          registriert_am: nutzer.created_at,
          letzte_anmeldung: nutzer.last_sign_in_at,
        },
      };

      var tabellen = ["steckbriefe", "portfolio", "portfolio_overview", "nutzer_zustimmungen"];
      for (var i = 0; i < tabellen.length; i++) {
        var name = tabellen[i];
        var res = await k.from(name).select("*");
        export_[name] = res.error ? { fehler: res.error.message } : res.data;
      }

      // Dateiliste (nur Pfade, keine Inhalte)
      var dateien = [];
      async function liste(pfad, tiefe) {
        if (tiefe > 4) return;
        var r = await k.storage.from("dokumente").list(pfad, { limit: 1000 });
        if (r.error) return;
        for (var j = 0; j < r.data.length; j++) {
          var e = r.data[j];
          var voll = pfad ? pfad + "/" + e.name : e.name;
          if (e.id === null) { await liste(voll, tiefe + 1); }
          else { dateien.push({ pfad: voll, groesse: e.metadata && e.metadata.size }); }
        }
      }
      await liste(nutzer.id, 0);
      export_.dateien = dateien;

      var blob = new Blob([JSON.stringify(export_, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download =
        "Immo.Expert Datenexport " + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);

      melde("Der Export wurde heruntergeladen.", false);
    } catch (e) {
      melde("Export nicht moeglich: " + e.message, true);
    } finally {
      if (knopf) knopf.disabled = false;
    }
  };

  /* ---------- Art. 17: Konto loeschen -------------------------------- */

  window.ieKontoLoeschen = async function () {
    var eingabe = window.prompt(
      "Damit werden Ihr Konto, alle Immobilien, Steckbriefe und Dateien " +
      "endgueltig geloescht. Das laesst sich nicht rueckgaengig machen.\n\n" +
      "Sichern Sie vorher Ihre Daten ueber den Export.\n\n" +
      "Zum Bestaetigen tippen Sie: KONTO LOESCHEN",
    );
    if (eingabe === null) return;
    if (eingabe.trim().toUpperCase() !== "KONTO LOESCHEN") {
      melde("Abgebrochen \u2013 die Eingabe stimmte nicht.", true);
      return;
    }

    var knopf = document.getElementById("ie-loeschen-knopf");
    if (knopf) knopf.disabled = true;
    melde("Konto wird geloescht \u2026", false);

    try {
      var k = klient();
      var res = await k.functions.invoke("delete-account", {
        body: { bestaetigung: "KONTO LOESCHEN" },
      });

      if (res.error) {
        var text = res.error.message;
        try {
          var d = await res.error.context.json();
          if (d && d.fehler) text = d.fehler;
        } catch (_) { /* Antwort war kein JSON */ }
        throw new Error(text);
      }

      await k.auth.signOut();
      alert("Ihr Konto wurde geloescht. Vielen Dank, dass Sie Immo.Expert genutzt haben.");
      window.location.href = "index.html";
    } catch (e) {
      melde(
        "Das Konto konnte nicht geloescht werden: " + e.message,
        true,
      );
      if (knopf) knopf.disabled = false;
    }
  };
})();
