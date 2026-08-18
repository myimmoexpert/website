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

  // Wert einer Immobilie im Monat m: Kaufpreis ab Übernahme, danach 2 % p. a.
  function wert (p, m) {
    var kp = kaufpreis(p)
    if (!kp) return 0
    var u = uebernahme(p)
    if (m < u) return 0
    return kp * Math.pow(WACHSTUM_M, monatDiff(m, u))
  }

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
    if (m < u) return { miete: 0, weitereMiete: 0, hausgeld: 0, bankrate: 0, grundsteuer: 0, cf: 0, imBestand: false }
    var miete    = ov1(p, 'miete', m)    !== null ? ov1(p, 'miete', m)    : wert1(p, 'nkm', m) + wert1(p, 'nk', m)
    var bankrate = ov1(p, 'bankrate', m) !== null ? ov1(p, 'bankrate', m) : wert1(p, 'zins', m) + wert1(p, 'tilgung', m)
    var weitereMiete = wert1(p, 'weitereMiete', m)
    var hausgeld     = wert1(p, 'hausgeld', m)
    var grundsteuer  = wert1(p, 'grundsteuer', m)
    var cfOv = ov1(p, 'cf', m)
    var cf = cfOv !== null ? cfOv : miete + weitereMiete + grundsteuer + hausgeld + bankrate
    return { miete: miete, weitereMiete: weitereMiete, hausgeld: hausgeld,
             bankrate: bankrate, grundsteuer: grundsteuer, cf: cf, imBestand: true }
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
    kaufpreis: kaufpreis, uebernahme: uebernahme,
    wert: wert, restschuld: restschuld, cfTeile: cfTeile, reihe: reihe,
    summeAlle: summeAlle, summeBis: summeBis,
  }
})()
