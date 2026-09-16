/* ══════════════════════════════════════════════════════════════
   Immo.Expert – gemeinsame Portfolio-Berechnungen

   Liegt bewusst in einer eigenen Datei, damit Kennzahlen und
   Graphen garantiert dieselben Formeln benutzen.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict'

  // 2 % pro Jahr, auf den Monat heruntergebrochen
  var WACHSTUM_PA = 0.02
  var WACHSTUM_M  = Math.pow(1 + WACHSTUM_PA, 1 / 12)

  function jetztMonat () {
    var d = new Date()
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
  }

  function monatPlus (m, n) {
    var t = m.split('-').map(Number)
    var idx = t[0] * 12 + (t[1] - 1) + n
    return Math.floor(idx / 12) + '-' + String(idx % 12 + 1).padStart(2, '0')
  }

  function monatDiff (a, b) {   // a - b in Monaten
    var x = a.split('-').map(Number), y = b.split('-').map(Number)
    return (x[0] * 12 + x[1]) - (y[0] * 12 + y[1])
  }

  // Fenster: n Monate zurück bis n Monate voraus, um den aktuellen Monat
  function fenster (zurueck, vor) {
    var mitte = jetztMonat(), out = []
    for (var i = -zurueck; i <= vor; i++) out.push(monatPlus(mitte, i))
    return out
  }

  function zellen (p) { return (p.liquiditaet && p.liquiditaet.cells) || {} }
  function ovs (p)    { return (p.liquiditaet && p.liquiditaet.overrides) || {} }

  function wert1 (p, key, m) { return Number(zellen(p)[key] && zellen(p)[key][m]) || 0 }

  function ov1 (p, key, m) {
    var o = ovs(p)[key]
    var v = o && o[m]
    return (v === undefined || v === null || v === '') ? null : Number(v)
  }

  // Summe einer Zeile bis einschließlich Monat m
  function summeBis (p, key, m) {
    var c = zellen(p)[key] || {}, s = 0
    for (var k in c) if (k <= m) s += Number(c[k]) || 0
    return s
  }

  function summeAlle (p, key) {
    var c = zellen(p)[key] || {}, s = 0
    for (var k in c) s += Number(c[k]) || 0
    return s
  }

  // Kaufpreis: bevorzugt aus der Liquiditätsplanung, sonst aus den Stammdaten
  function kaufpreis (p) {
    return Math.abs(summeAlle(p, 'kaufpreis')) || Number(p.kaufpreis) || 0
  }

  // Monat der Übernahme
  function uebernahme (p) {
    if (p.kaufdatum) return String(p.kaufdatum).slice(0, 7)
    var c = zellen(p).kaufpreis || {}
    var keys = Object.keys(c).sort()
    if (keys.length) return keys[0]
    return (p.liquiditaet && p.liquiditaet.startMonth) || jetztMonat()
  }

  // Übernahmestichtag (TT = Übergang von Nutzen und Lasten), vom Nutzer gewählt.
  // Bewusst getrennt von „kaufdatum“: das steht auf dem Vortag der Eintragung,
  // damit Wert, Cashflow und Restschuld sofort angezeigt werden. Der Stichtag
  // ist nur für Fristen und die Anzeige „Im Portfolio seit“ maßgeblich.
  function stichtag (p) {
    var d = p && p.einstellungen && p.einstellungen.uebernahmestichtag
    return d && /^\d{4}-\d{2}-\d{2}/.test(String(d)) ? String(d).slice(0, 10) : null
  }

  // Wie der aktuelle Wert einer Immobilie bestimmt wird, legt die
  // Immobilie selbst fest (Zahnrad an der Kachel „Aktueller Wert"):
  //   kaufpreis   – der gezahlte Kaufpreis
  //   steigerung  – Kaufpreis plus X % pro Jahr ab Übernahme
  //   eigen       – ein von Hand eingetragener Wert
  function wertEinstellung (p) {
    var e = (p && p.einstellungen) || {}
    var modus = e.wertModus || 'kaufpreis'
    var proz  = Number(e.wertSteigerungPa)
    return {
      modus: modus,
      steigerung: isNaN(proz) ? 0 : proz,
      eigen: Number(e.wertEigen != null ? e.wertEigen : p && p.wert) || 0,
    }
  }

  function wert (p, m) {
    var e = wertEinstellung(p)
    var u = uebernahme(p)
    if (m && m < u) return 0

    if (e.modus === 'eigen') return e.eigen

    var kp = kaufpreis(p)
    if (!kp) return e.modus === 'eigen' ? e.eigen : 0
    if (e.modus === 'steigerung' && e.steigerung) {
      var faktorM = Math.pow(1 + e.steigerung / 100, 1 / 12)
      return kp * Math.pow(faktorM, monatDiff(m || jetztMonat(), u))
    }
    return kp
  }

  // Wert zum heutigen Tag – für Kacheln und den Portfoliowert
  function aktuellerWert (p) { return wert(p, jetztMonat()) }

  // Restschuld: valutiertes Fremdkapital abzüglich geleisteter Tilgung
  function restschuld (p, m) {
    var u = uebernahme(p)
    if (m < u) return 0
    var fk = Math.abs(summeBis(p, 'einzahlungFk', m))
    var tg = Math.abs(summeBis(p, 'tilgung', m))
    return Math.max(0, fk - tg)
  }

  // Bestandteile des Cashflows in einem Monat
  function cfTeile (p, m) {
    var u = uebernahme(p)
    if (m < u) return { miete: 0, weitereMiete: 0, hausgeld: 0, bankrate: 0, zins: 0, tilgung: 0, bankrateFix: false, grundsteuer: 0, cf: 0, imBestand: false }
    var miete    = ov1(p, 'miete', m)    !== null ? ov1(p, 'miete', m)    : wert1(p, 'nkm', m) + wert1(p, 'nk', m)
    var bankrateFix = ov1(p, 'bankrate', m) !== null
    var zins = wert1(p, 'zins', m), tilgung = wert1(p, 'tilgung', m)
    var bankrate = bankrateFix ? ov1(p, 'bankrate', m) : zins + tilgung
    var weitereMiete = wert1(p, 'weitereMiete', m)
    var hausgeld     = wert1(p, 'hausgeld', m)
    var grundsteuer  = wert1(p, 'grundsteuer', m)
    var cfOv = ov1(p, 'cf', m)
    var cf = cfOv !== null ? cfOv : miete + weitereMiete + grundsteuer + hausgeld + bankrate
    return { miete: miete, weitereMiete: weitereMiete, hausgeld: hausgeld,
             bankrate: bankrate, zins: zins, tilgung: tilgung, bankrateFix: bankrateFix,
             grundsteuer: grundsteuer, cf: cf, imBestand: true }
  }

  // Über alle Immobilien je Monat
  function reihe (props, monate) {
    return monate.map(function (m) {
      var w = 0, fk = 0, miete = 0, hausgeld = 0, bankrate = 0, cf = 0
      props.forEach(function (p) {
        w  += wert(p, m)
        fk += restschuld(p, m)
        var t = cfTeile(p, m)
        miete += t.miete + t.weitereMiete
        hausgeld += t.hausgeld
        bankrate += t.bankrate
        cf += t.cf
      })
      return { monat: m, wert: w, fremdkapital: Math.min(fk, w), eigenkapital: Math.max(0, w - fk),
               miete: miete, hausgeld: hausgeld, bankrate: bankrate, cf: cf }
    })
  }

  window.IECalc = {
    WACHSTUM_PA: WACHSTUM_PA,
    jetztMonat: jetztMonat, monatPlus: monatPlus, monatDiff: monatDiff, fenster: fenster,
    kaufpreis: kaufpreis, uebernahme: uebernahme, stichtag: stichtag,
    wert: wert, aktuellerWert: aktuellerWert, wertEinstellung: wertEinstellung, restschuld: restschuld, cfTeile: cfTeile, reihe: reihe,
    summeAlle: summeAlle, summeBis: summeBis,
  }
})()
