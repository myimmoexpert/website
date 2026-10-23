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

  // Ab wann gerechnet wird: der Übernahmestichtag, sobald er gepflegt ist.
  // „kaufdatum" steht auf dem Vortag der Eintragung ins Tool und taugt
  // deshalb nicht als Ausgangspunkt für die Wertsteigerung.
  function wertBasis (p) {
    var st = stichtag(p)
    return st ? st.slice(0, 7) : uebernahme(p)
  }

  // Ab wann die Immobilie im Bestand ist. Maßgeblich ist der Übernahme-
  // stichtag; wann die Immobilie ins Tool eingetragen wurde, spielt keine
  // Rolle. Von beiden gilt der frühere Zeitpunkt, damit erfasste Zahlen
  // nie verschwinden.
  function bestandAb (p) {
    var u = uebernahme(p), w = wertBasis(p)
    return (w && w < u) ? w : u
  }

  // Nettokaltmiete eines Monats (Übersteuerung hat Vorrang)
  function nkmMonat (p, m) {
    var v = (ovs(p).nkm || {})[m]
    if (v !== undefined && v !== null && v !== '') return Math.abs(Number(v) || 0)
    return Math.abs(Number((zellen(p).nkm || {})[m]) || 0)
  }

  // Zuletzt bekannte Nettokaltmiete bis einschließlich diesem Monat
  function nkmBis (p, m) {
    var c = zellen(p).nkm || {}, o = ovs(p).nkm || {}
    var keys = []
    Object.keys(c).concat(Object.keys(o)).forEach(function (k) {
      if (/^\d{4}-\d{2}$/.test(k) && keys.indexOf(k) === -1) keys.push(k)
    })
    keys.sort()
    var letzte = 0, erste = 0
    keys.forEach(function (k) {
      var v = nkmMonat(p, k)
      if (v <= 0.004) return
      if (!erste) erste = v
      if (!m || k <= m) letzte = v
    })
    return letzte || erste
  }

  // Faktor, zu dem gekauft wurde: Kaufpreis ÷ Jahresnettokaltmiete zum
  // Übernahmestichtag – nicht zu der Miete, die heute gilt.
  function kaufFaktor (p) {
    var kp = kaufpreis(p)
    var nkm = nkmBis(p, wertBasis(p))
    return (kp > 0 && nkm > 0) ? kp / (nkm * 12) : 0
  }

  // Wie der aktuelle Wert einer Immobilie bestimmt wird, legt die
  // Immobilie selbst fest (Zahnrad an der Kachel „Aktueller Wert"):
  //   kaufpreis   – der gezahlte Kaufpreis
  //   steigerung  – Kaufpreis plus X % pro Jahr ab Übernahmestichtag
  //   faktor      – X-fache der aktuellen Jahresnettokaltmiete
  //   eigen       – ein von Hand eingetragener Wert
  function wertEinstellung (p) {
    var e = (p && p.einstellungen) || {}
    var modus = e.wertModus || 'kaufpreis'
    var proz  = Number(e.wertSteigerungPa)
    var fak   = Number(e.wertFaktor)
    return {
      modus: modus,
      steigerung: isNaN(proz) ? 0 : proz,
      faktor: isNaN(fak) || fak <= 0 ? 0 : fak,
      eigen: Number(e.wertEigen != null ? e.wertEigen : p && p.wert) || 0,
    }
  }

  function wert (p, m) {
    var e = wertEinstellung(p)
    var u = bestandAb(p)
    if (m && m < u) return 0

    if (e.modus === 'eigen') return e.eigen

    var kp = kaufpreis(p)

    if (e.modus === 'faktor') {
      var f = e.faktor || kaufFaktor(p)
      var miete = nkmBis(p, m || jetztMonat())
      if (f > 0 && miete > 0) return miete * 12 * f
      return kp
    }

    if (!kp) return 0
    if (e.modus === 'steigerung' && e.steigerung) {
      var faktorM = Math.pow(1 + e.steigerung / 100, 1 / 12)
      // Vor dem Stichtag wird nicht rückwärts abgezinst
      var monate = Math.max(0, monatDiff(m || jetztMonat(), wertBasis(p)))
      return kp * Math.pow(faktorM, monate)
    }
    return kp
  }

  // Wert zum heutigen Tag – für Kacheln und den Portfoliowert
  function aktuellerWert (p) { return wert(p, jetztMonat()) }

  /* ── Darlehen ────────────────────────────────────────────
     Je Immobilie sind bis zu fünf Darlehen möglich. Das erste
     heißt wie bisher „zins"/„tilgung"/„bankrate", die weiteren
     bekommen die Nummer angehängt: „zins2", „tilgung3" … */
  var DARLEHEN_MAX = 5
  function dKey (basis, n) { return n === 1 ? basis : basis + n }

  // Genauso lassen sich mehrere Hausgeldzahlungen erfassen
  var HAUSGELD_MAX = 5
  function hausgeldAnzahl (p) {
    var lq = (p && p.liquiditaet) || p || {}
    var n = Number(lq.hausgelder) || 0
    if (!n) {
      var c = lq.cells || {}
      for (var i = HAUSGELD_MAX; i >= 2; i--) {
        var k = dKey('hausgeld', i)
        if (c[k] && Object.keys(c[k]).length) { n = i; break }
      }
    }
    return Math.min(HAUSGELD_MAX, Math.max(1, n || 1))
  }

  // Wie viele Darlehen hat diese Immobilie? Mindestens eins.
  function darlehenAnzahl (p) {
    var lq = (p && p.liquiditaet) || p || {}
    var n = Number(lq.darlehen) || 0
    if (!n && lq.darlehen2) n = 2          // alter Stand mit genau zwei Darlehen
    if (!n) {
      // Sicherheitsnetz: steht in einer höheren Zeile ein Wert, zählt sie mit
      for (var i = DARLEHEN_MAX; i >= 2; i--) {
        var c = (lq.cells || {})
        if ((c[dKey('zins', i)] && Object.keys(c[dKey('zins', i)]).length) ||
            (c[dKey('tilgung', i)] && Object.keys(c[dKey('tilgung', i)]).length)) { n = i; break }
      }
    }
    return Math.min(DARLEHEN_MAX, Math.max(1, n || 1))
  }

  // Restschuld: valutiertes Fremdkapital abzüglich geleisteter Tilgung
  function restschuld (p, m) {
    var u = bestandAb(p)
    if (m < u) return 0
    var fk = Math.abs(summeBis(p, 'einzahlungFk', m))
    var tg = 0
    for (var n = 1; n <= DARLEHEN_MAX; n++) tg += Math.abs(summeBis(p, dKey('tilgung', n), m))
    return Math.max(0, fk - tg)
  }

  // Bestandteile des Cashflows in einem Monat
  // Die Grundsteuer gehört nicht zum CF Wohnung – sie steht in der
  // Tabelle unterhalb davon bei den unregelmäßigen Posten.
  function cfTeile (p, m) {
    var u = bestandAb(p)
    if (m < u) return { miete: 0, weitereMiete: 0, hausgeld: 0, bankrate: 0, zins: 0, tilgung: 0,
                        bankrate1: 0, bankrate2: 0, zins2: 0, tilgung2: 0,
                        bankrateN: [], zinsAlle: 0, tilgungAlle: 0, hausgeldN: [],
                        bankrateFix: false, grundsteuer: 0, cf: 0, imBestand: false }
    var miete    = ov1(p, 'miete', m)    !== null ? ov1(p, 'miete', m)    : wert1(p, 'nkm', m) + wert1(p, 'nk', m)
    var bankrateFix = ov1(p, 'bankrate', m) !== null
    var zins = wert1(p, 'zins', m), tilgung = wert1(p, 'tilgung', m)
    var bankrate1 = bankrateFix ? ov1(p, 'bankrate', m) : zins + tilgung

    // Weitere Darlehen (optional je Immobilie)
    var bankrateN = [bankrate1], zinsAlle = zins, tilgungAlle = tilgung
    var bankrate = bankrate1
    for (var n = 2; n <= DARLEHEN_MAX; n++) {
      var zN = wert1(p, dKey('zins', n), m), tN = wert1(p, dKey('tilgung', n), m)
      var ovN = ov1(p, dKey('bankrate', n), m)
      var rate = ovN !== null ? ovN : zN + tN
      bankrateN.push(rate)
      zinsAlle += zN; tilgungAlle += tN; bankrate += rate
    }

    var weitereMiete = wert1(p, 'weitereMiete', m)
    // Alle Hausgeldzahlungen der Immobilie zusammen
    var hausgeldN = [], hausgeld = 0
    for (var h = 1; h <= HAUSGELD_MAX; h++) {
      var hv = wert1(p, dKey('hausgeld', h), m)
      hausgeldN.push(hv)
      hausgeld += hv
    }
    var grundsteuer  = wert1(p, 'grundsteuer', m)
    var cfOv = ov1(p, 'cf', m)
    var cf = cfOv !== null ? cfOv : miete + weitereMiete + hausgeld + bankrate
    return { miete: miete, weitereMiete: weitereMiete, hausgeld: hausgeld,
             bankrate: bankrate, bankrate1: bankrate1, bankrate2: bankrateN[1] || 0,
             bankrateN: bankrateN,
             zins: zins, tilgung: tilgung,
             zins2: wert1(p, 'zins2', m), tilgung2: wert1(p, 'tilgung2', m),
             zinsAlle: zinsAlle, tilgungAlle: tilgungAlle, hausgeldN: hausgeldN,
             bankrateFix: bankrateFix,
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
    DARLEHEN_MAX: DARLEHEN_MAX, dKey: dKey, darlehenAnzahl: darlehenAnzahl,
    HAUSGELD_MAX: HAUSGELD_MAX, hausgeldAnzahl: hausgeldAnzahl,
    jetztMonat: jetztMonat, monatPlus: monatPlus, monatDiff: monatDiff, fenster: fenster,
    kaufpreis: kaufpreis, uebernahme: uebernahme, stichtag: stichtag, wertBasis: wertBasis, bestandAb: bestandAb,
    nkmBis: nkmBis, kaufFaktor: kaufFaktor,
    wert: wert, aktuellerWert: aktuellerWert, wertEinstellung: wertEinstellung, restschuld: restschuld, cfTeile: cfTeile, reihe: reihe,
    summeAlle: summeAlle, summeBis: summeBis,
  }
})()
