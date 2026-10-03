/* ══════════════════════════════════════════════════════════════
   Immo.Expert – Portfolio-Graphen
   Nutzt die Bausteine aus ie-charts.js und die Formeln aus
   portfolio-calc.js. Wird auf portfolio.html, der Seite
   Portfoliokennzahlen und auf der Immobilienseite verwendet.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict'

  var MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

  function pct (n) {
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n || 0) + ' %'
  }
  function monatName (m, lang) {
    var t = m.split('-').map(Number)
    return lang
      ? new Date(t[0], t[1] - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
      : MONATE_KURZ[t[1] - 1] + ' ' + String(t[0]).slice(2)
  }

  /* ── Zeitraum des Portfoliowert-Graphen ──────────────────
     Standard: voriges Jahr bis acht Jahre voraus (zehn Jahre).
     Über das Zahnrad lassen sich Start und Ende frei setzen; die
     Einstellung bleibt im Browser gespeichert. */
  var ZR_KEY = 'ie_pw_zeitraum'
  function zeitraum () {
    var jetztJ = new Date().getFullYear()
    var std = { von: jetztJ - 1, bis: jetztJ + 8 }
    try {
      var z = JSON.parse(localStorage.getItem(ZR_KEY) || 'null')
      if (z && z.von && z.bis && z.bis >= z.von) {
        return { von: Math.max(1990, z.von | 0), bis: Math.min(2100, Math.max(z.von | 0, z.bis | 0)) }
      }
    } catch (e) {}
    return std
  }
  function zeitraumSetzen (von, bis) {
    try { localStorage.setItem(ZR_KEY, JSON.stringify({ von: von, bis: bis })) } catch (e) {}
  }
  function zeitraumJahre () {
    var z = zeitraum(), out = []
    for (var j = z.von; j <= z.bis; j++) out.push(j)
    return out.length ? out : [new Date().getFullYear()]
  }

  /* ── Zehn Jahre, in denen das Portfolio besteht ──────────── */
  function zehnJahre (props) {
    var C = window.IECalc
    var jetztJ = new Date().getFullYear()
    var frueh = null
    ;(props || []).forEach(function (p) {
      var y = Number(String(C.uebernahme(p)).slice(0, 4))
      if (y && (frueh === null || y < frueh)) frueh = y
    })
    var start = frueh === null ? jetztJ : Math.min(Math.max(frueh, jetztJ - 9), jetztJ)
    var out = []
    for (var j = start; j < start + 10; j++) out.push(j)
    return out
  }

  // Ein Eintrag je Jahr: Bestände zum Jahresende, Flüsse als Jahressumme
  function jahresDaten (props, jahre) {
    var C = window.IECalc
    var jetztJ = new Date().getFullYear()
    return jahre.map(function (j) {
      var monate = []
      for (var m = 1; m <= 12; m++) monate.push(j + '-' + String(m).padStart(2, '0'))
      var reihe = C.reihe(props || [], monate)
      var ende = reihe[11]
      var sum = function (k) { return reihe.reduce(function (s, r) { return s + r[k] }, 0) }
      var zins = 0, tilgung = 0
      monate.forEach(function (mm) {
        ;(props || []).forEach(function (p) {
          var t = C.cfTeile(p, mm)
          zins += t.zins; tilgung += t.tilgung
        })
      })
      return {
        jahr: j, wert: ende.wert, fremdkapital: ende.fremdkapital, eigenkapital: ende.eigenkapital,
        miete: sum('miete'), hausgeld: sum('hausgeld'), bankrate: sum('bankrate'), cf: sum('cf'),
        zins: zins, tilgung: tilgung,
        prognose: j > jetztJ, heute: j === jetztJ
      }
    })
  }

  // Monatlicher Cashflow als Schritte für den Wasserfall
  function cfSchritte (props, monat) {
    var C = window.IECalc, F = window.IEChart.farben
    var s = { miete: 0, hausgeld: 0, zins: 0, tilgung: 0, bankrate: 0, grundsteuer: 0, cf: 0, fix: false }
    ;(props || []).forEach(function (p) {
      var t = C.cfTeile(p, monat)
      s.miete += t.miete + t.weitereMiete
      s.hausgeld += t.hausgeld
      s.grundsteuer += t.grundsteuer
      s.bankrate += t.bankrate
      s.zins += t.zins + (t.zins2 || 0); s.tilgung += t.tilgung + (t.tilgung2 || 0)
      if (t.bankrateFix) s.fix = true
      s.cf += t.cf
    })
    // weicht der gebuchte Cashflow von der Summe ab (Übersteuerung), als eigenen Schritt zeigen
    var bank = s.fix
      ? [{ name: 'Darlehen', wert: -Math.abs(s.bankrate), farbe: F.TERRA }]
      : [{ name: 'Zins', wert: -Math.abs(s.zins), farbe: F.TERRA },
         { name: 'Tilgung', wert: -Math.abs(s.tilgung), farbe: F.TEAL, hinweis: 'baut Eigenkapital auf' }]
    var schritte = [{ name: 'Miete', wert: s.miete, farbe: F.GOLD },
                    { name: 'Hausgeld', wert: -Math.abs(s.hausgeld), farbe: F.BLAU }]
      .concat(bank)
      .concat([{ name: 'Grundsteuer', wert: -Math.abs(s.grundsteuer), farbe: '#7d786f' }])
    var summe = schritte.reduce(function (a, x) { return a + x.wert }, 0)
    if (Math.abs(summe - s.cf) > 0.5) schritte.push({ name: 'Sonstiges', wert: s.cf - summe, farbe: '#7d786f' })
    schritte.push({ name: 'Cashflow', summe: true, farbe: '#e9e4d8' })
    return { schritte: schritte, cf: s.cf, teile: s }
  }

  // Mietrendite je Immobilie (Stand heute)
  function objektDaten (props) {
    var C = window.IECalc
    var m = C.jetztMonat()
    return (props || []).map(function (p) {
      var t = C.cfTeile(p, m)
      var basis = C.aktuellerWert(p) || C.kaufpreis(p)
      var jahresMiete = (t.miete + t.weitereMiete) * 12
      return {
        name: p.bezeichnung || 'Immobilie', basis: basis, miete: jahresMiete, cf: t.cf * 12,
        rendite: basis > 0 ? (jahresMiete / basis) * 100 : 0
      }
    }).filter(function (o) { return o.basis > 0 })
      .sort(function (a, b) { return b.rendite - a.rendite })
  }

  /* ── Einzelne Charts, auch für andere Seiten ─────────────── */
  function chartPortfoliowert (karte, props) {
    var F = window.IEChart.farben, eur = window.IEChart.eur
    var daten = jahresDaten(props, zeitraumJahre())
    var akt = daten.findIndex(function (d) { return d.heute })
    window.IEChart.saeulen(karte.querySelector('.pc-plot'), {
      aria: 'Portfoliowert je Jahr',
      labels: daten.map(function (d) { return String(d.jahr) }),
      serien: [{ name: 'Portfoliowert', farbe: F.GOLD, werte: daten.map(function (d) { return d.wert }) }],
      aktuell: akt,
      blass: function (i) { return i !== akt },
      wertOben: true,
      tipTitel: function (i) { return daten[i].jahr + (daten[i].prognose ? ' · Prognose' : daten[i].heute ? ' · laufendes Jahr' : '') },
      tipExtra: function (i) {
        return [{ c: F.INK2, t: 'davon Fremdkapital', v: eur(daten[i].fremdkapital) },
                { c: F.INK2, t: 'davon Eigenkapital', v: eur(daten[i].eigenkapital) }]
      }
    })
  }

  function chartCashflow (karte, props, monat) {
    var r = cfSchritte(props, monat)
    window.IEChart.wasserfall(karte.querySelector('.pc-plot'), {
      aria: 'Monatlicher Cashflow', schritte: r.schritte,
      // ausgeschrieben mit Tausenderpunkt statt „2k"
      achseFormat: function (v) { return Math.round(v).toLocaleString('de-DE') }
    })
    return r
  }

  function chartRendite (karte, props) {
    var F = window.IEChart.farben
    var objekte = objektDaten(props)
    var summeMiete = objekte.reduce(function (s, o) { return s + o.miete }, 0)
    var summeBasis = objekte.reduce(function (s, o) { return s + o.basis }, 0)
    var schnitt = summeBasis > 0 ? (summeMiete / summeBasis) * 100 : 0
    window.IEChart.balken(karte.querySelector('.pc-plot'), {
      aria: 'Mietrendite je Immobilie',
      leerText: 'Noch keine Immobilie mit Wert erfasst.',
      labels: objekte.map(function (o) { return o.name }),
      serien: [{ name: 'Mietrendite', farbe: F.GOLD, werte: objekte.map(function (o) { return o.rendite }) }],
      format: pct,
      achse: function (v) { return v.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %' },
      rechts: function (i) { return pct(objekte[i].rendite) },
      referenz: { wert: schnitt, name: 'Schnitt' },
      tipExtra: function (i) {
        return [{ c: F.INK2, t: 'Jahresmiete', v: window.IEChart.eur(objekte[i].miete) },
                { c: F.INK2, t: 'Wert', v: window.IEChart.eur(objekte[i].basis) }]
      }
    })
    return schnitt
  }

  /* ── portfolio.html ──────────────────────────────────────── */
  function aufbauen (container, props) {
    if (!container || !window.IECalc || !window.IEChart) return
    var C = window.IECalc, F = window.IEChart.farben, K = window.IEChart
    var monat = C.jetztMonat()
    var jahre = zehnJahre(props)

    var vorschauCf = cfSchritte(props, monat)
    var objekte = objektDaten(props)
    var sm = objekte.reduce(function (s, o) { return s + o.miete }, 0)
    var sb = objekte.reduce(function (s, o) { return s + o.basis }, 0)

    var jd = jahresDaten(props, jahre)
    var heuteJ = jd.find(function (d) { return d.heute }) || jd[jd.length - 1]
    var ersteJ = jd.find(function (d) { return d.wert > 0 }) || jd[0]
    var zuwachs = ersteJ && ersteJ.wert > 0 ? (heuteJ.wert / ersteJ.wert - 1) * 100 : 0
    var gibt = {}
    vorschauCf.schritte.forEach(function (x) { if (x.summe || Math.abs(x.wert) > 0.004) gibt[x.name] = true })

    container.innerHTML =
      K.karte({ id: 'pcAum', titel: 'Entwicklung Portfoliowert',
        werkzeug: '<button type="button" class="pc-zahnrad" id="pcAumZahnrad" title="Zeitraum einstellen" aria-label="Zeitraum einstellen">⚙</button>',
        hero: { wert: K.eur(heuteJ ? heuteJ.wert : 0) } }) +
      K.karte({ id: 'pcCf', titel: 'Cashflow im ' + monatName(monat, true),
        hero: { wert: K.eur(vorschauCf.cf),
                klasse: vorschauCf.cf < -0.004 ? 'red' : 'green' },
        legende: vorschauCf.schritte.filter(function (x) { return gibt[x.name] })
          .map(function (x) { return { c: x.farbe, t: x.name } }) }) +
      K.karte({ id: 'pcRd', titel: 'Mietrendite je Immobilie',
        info: 'Jahresmiete bezogen auf den aktuellen Wert der Immobilie · Stand heute.',
        hero: { wert: pct(sb > 0 ? sm / sb * 100 : 0), label: 'Portfolio im Schnitt' },
        legende: [{ c: F.GOLD, t: 'Mietrendite' }, { c: F.INK, t: 'Portfolioschnitt', linie: true }] })

    chartPortfoliowert(container.querySelector('#pcAum'), props)
    chartCashflow(container.querySelector('#pcCf'), props, monat)
    chartRendite(container.querySelector('#pcRd'), props)
    zahnradVerdrahten(container, props)
  }

  /* Zahnrad am Portfoliowert: Start- und Endjahr frei wählen */
  function zahnradVerdrahten (container, props) {
    var btn = container.querySelector('#pcAumZahnrad')
    if (!btn) return
    btn.addEventListener('click', function (e) {
      e.stopPropagation()
      var alt = container.querySelector('.pc-zeitraum')
      if (alt) { alt.remove(); return }
      var z = zeitraum()
      var box = document.createElement('div')
      box.className = 'pc-zeitraum'
      box.innerHTML =
        '<label>Von <input type="number" id="pcZrVon" value="' + z.von + '" min="1990" max="2100" step="1"></label>' +
        '<label>Bis <input type="number" id="pcZrBis" value="' + z.bis + '" min="1990" max="2100" step="1"></label>' +
        '<div class="pc-zeitraum-btns">' +
          '<button type="button" class="pc-zr-std">Standard</button>' +
          '<button type="button" class="pc-zr-ok">Übernehmen</button>' +
        '</div>'
      btn.parentElement.appendChild(box)
      box.addEventListener('click', function (ev) { ev.stopPropagation() })
      box.querySelector('.pc-zr-ok').addEventListener('click', function () {
        var von = parseInt(box.querySelector('#pcZrVon').value, 10)
        var bis = parseInt(box.querySelector('#pcZrBis').value, 10)
        if (!von || !bis || bis < von) return
        if (bis - von > 49) bis = von + 49
        zeitraumSetzen(von, bis)
        box.remove()
        aufbauen(container, props)
      })
      box.querySelector('.pc-zr-std').addEventListener('click', function () {
        try { localStorage.removeItem(ZR_KEY) } catch (er) {}
        box.remove()
        aufbauen(container, props)
      })
      setTimeout(function () {
        document.addEventListener('click', function weg () {
          var b = container.querySelector('.pc-zeitraum')
          if (b) b.remove()
          document.removeEventListener('click', weg)
        }, { once: true })
      }, 0)
    })
  }

  var letzte = null, resizeTimer = null
  window.IECharts = {
    render: function (container, props) {
      letzte = { c: container, p: props }
      aufbauen(container, props)
    },
    zehnJahre: zehnJahre,
    zeitraumJahre: zeitraumJahre,
    jahresDaten: jahresDaten,
    cfSchritte: cfSchritte,
    objektDaten: objektDaten,
    monatName: monatName,
    pct: pct,
    chartPortfoliowert: chartPortfoliowert,
    chartCashflow: chartCashflow,
    chartRendite: chartRendite
  }
  window.addEventListener('resize', function () {
    if (!letzte) return
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(function () { aufbauen(letzte.c, letzte.p) }, 180)
  })
})()
