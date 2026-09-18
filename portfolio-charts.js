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
      s.zins += t.zins; s.tilgung += t.tilgung
      if (t.bankrateFix) s.fix = true
      s.cf += t.cf
    })
    // weicht der gebuchte Cashflow von der Summe ab (Übersteuerung), als eigenen Schritt zeigen
    var bank = s.fix
      ? [{ name: 'Bankrate', wert: -Math.abs(s.bankrate), farbe: F.TERRA }]
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
    var daten = jahresDaten(props, zehnJahre(props))
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
        hero: { wert: K.eur(heuteJ.wert), label: 'Portfoliowert heute' +
                  (zuwachs ? ' · ' + (zuwachs >= 0 ? '+' : '') + pct(zuwachs) + ' seit ' + ersteJ.jahr : '') },
        info: 'Wert aller Immobilien zum Jahresende, ' + jahre[0] + ' bis ' + jahre[9] +
              '. Das laufende Jahr ist hervorgehoben, spätere Jahre sind eine Prognose aus der Werteinstellung der einzelnen Immobilien.' }) +
      K.karte({ id: 'pcCf', titel: 'Cashflow im ' + monatName(monat, true),
        info: 'Von der Miete zum Überschuss: jede Säule zieht eine Zahlung ab. Werte aus der Liquiditätsplanung aller Immobilien für den laufenden Monat.',
        hero: { wert: K.eur(vorschauCf.cf), label: vorschauCf.cf < -0.004 ? 'Unterdeckung pro Monat' : 'Überschuss pro Monat',
                klasse: vorschauCf.cf < -0.004 ? 'red' : 'green' },
        legende: vorschauCf.schritte.filter(function (x) { return gibt[x.name] })
          .map(function (x) { return { c: x.farbe, t: x.name } }) }) +
      K.karte({ id: 'pcRd', titel: 'Mietrendite je Immobilie',
        info: 'Jahresmiete bezogen auf den aktuellen Wert der Immobilie · Stand heute. Die gestrichelte Linie ist der Portfolioschnitt.',
        hero: { wert: pct(sb > 0 ? sm / sb * 100 : 0), label: 'Portfolio im Schnitt' },
        legende: [{ c: F.GOLD, t: 'Mietrendite' }, { c: F.INK, t: 'Portfolioschnitt', linie: true }] })

    chartPortfoliowert(container.querySelector('#pcAum'), props)
    chartCashflow(container.querySelector('#pcCf'), props, monat)
    chartRendite(container.querySelector('#pcRd'), props)
  }

  var letzte = null, resizeTimer = null
  window.IECharts = {
    render: function (container, props) {
      letzte = { c: container, p: props }
      aufbauen(container, props)
    },
    zehnJahre: zehnJahre,
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
