/* ══════════════════════════════════════════════════════════════
   Immo.Expert – Szenariorechner (Portfolio → Szenariorechner)

   Schreibt den heutigen Stand einer Immobilie (oder aller) Monat für
   Monat fort und rechnet aus, wo sie bei einem Verkauf nach X Jahren
   steht. Ausgangswerte kommen aus portfolio-calc.js (Wert, Restschuld,
   Cashflow-Bestandteile des laufenden Monats), die Annahmen legt der
   Nutzer selbst fest. Keine Datenbankänderung: die zuletzt benutzten
   Annahmen merkt sich nur der Browser.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict'

  var LS_KEY = 'ie_szenario_v1'

  /* Parameter: key, Gruppe, Beschriftung, Einheit, min, max, Schritt, Info */
  var PARAMS = [
    { key: 'jahre',       gruppe: 'Zeitraum',     label: 'Verkauf (Exit) nach',            einheit: 'Jahren', min: 1,  max: 40,    step: 1,    slider: true,
      info: 'Nach so vielen Jahren wird der Verkauf angenommen – wahlweise gerechnet ab heute oder ab der Übernahme der Immobilie.' },
    { key: 'wert',        gruppe: 'Markt',        label: 'Wertentwicklung',                einheit: '% / Jahr', min: -10, max: 15, step: 0.1, nurModus: 'wert',
      info: 'Jährliche Veränderung des Immobilienwerts ab dem heutigen Wert. Negativ = Wertverlust.' },
    { key: 'faktor',      gruppe: 'Markt',        label: 'Verkaufsfaktor',                 einheit: '× Jahresnettokaltmiete', min: 0, max: 60, step: 0.5, nurModus: 'faktor',
      info: 'Der Verkaufspreis ergibt sich aus der Jahresnettokaltmiete des jeweiligen Jahres mal diesem Faktor.' },
    { key: 'miete',       gruppe: 'Markt',        label: 'Mietsteigerung',                 einheit: '% / Jahr', min: -5, max: 10,  step: 0.1,
      info: 'Die Miete steigt jeweils zum Beginn eines neuen Jahres um diesen Satz (z. B. Index- oder Staffelmiete).' },
    { key: 'kosten',      gruppe: 'Markt',        label: 'Kostensteigerung',               einheit: '% / Jahr', min: -5, max: 10,  step: 0.1,
      info: 'Jährliche Steigerung von Hausgeld.' },
    { key: 'ausfall',     gruppe: 'Markt',        label: 'Mietausfall / Leerstand',        einheit: '%',       min: 0,  max: 50,    step: 0.5,
      info: 'Anteil der Mieteinnahmen, der im Schnitt ausfällt – durch Leerstand, Mieterwechsel oder Zahlungsausfall.' },
    { key: 'zinsbindung', gruppe: 'Finanzierung', label: 'Zinsbindung endet nach',         einheit: 'Jahren nach dem Kaufdatum', min: 0,  max: 40,    step: 1,
      info: 'Jahren nach dem Kaufdatum' },
    { key: 'anschluss',   gruppe: 'Finanzierung', label: 'Anschlusszins',                  einheit: '% / Jahr', min: 0, max: 15,   step: 0.1,
      info: 'Sollzins nach Ende der Zinsbindung.' },
    { key: 'sonder',      gruppe: 'Finanzierung', label: 'Sondertilgung',                  einheit: '€ / Jahr', min: 0, max: 1000000, step: 500,
      info: 'Zahlung zusätzlich zur Bankrate, jeweils am Ende eines Jahres. Senkt den Cashflow und die Restschuld. Beim Gesamtportfolio je Immobilie.' },
    { key: 'instand',     gruppe: 'Ausgaben & Verkauf', label: 'Zusätzliche Instandhaltung', einheit: '€ / Monat', min: 0, max: 100000, step: 10,
      info: 'Rücklage oder Reparaturen, die nicht im Hausgeld stecken. Beim Gesamtportfolio je Immobilie.' },
    { key: 'verkauf',     gruppe: 'Ausgaben & Verkauf', label: 'Verkaufskosten',            einheit: '% vom Wert', min: 0, max: 20, step: 0.5,
      info: 'Makler, Notar, Vorfälligkeitsentschädigung o. ä. – wird beim Exit vom Verkaufspreis abgezogen.' },
  ]

  var VORLAGEN = {
    basis:        { label: 'Basis',        werte: { wert: 2, miete: 2, kosten: 2, ausfall: 0, zinsbindung: 0, anschluss: 4, sonder: 0, instand: 0, verkauf: 3, faktor: 25 } },
    optimistisch: { label: 'Optimistisch', werte: { wert: 3, miete: 3, kosten: 1.5, ausfall: 0, zinsbindung: 0, anschluss: 3, sonder: 0, instand: 0, verkauf: 3, faktor: 28 } },
  }

  // Exit ab heute oder ab Übernahme; Verkaufspreis über Wertentwicklung oder Faktor
  var EXIT_BASIS = { heute: 'ab heute', uebernahme: 'ab Übernahme' }
  var EXIT_MODUS = { wert: 'Wertentwicklung', faktor: 'Verkaufsfaktor' }

  var state = { auswahl: 'portfolio', p: null, vorlage: 'basis', basis: 'heute', modus: 'wert' }
  var props = []
  var gebaut = false

  function C () { return window.IECalc }
  function K () { return window.IEChart }
  function esc (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
  function eur (n) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(n || 0))
  }
  function pct (n) {
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n) + ' %'
  }
  function zahl (v, fallback) {
    var n = parseFloat(String(v == null ? '' : v).replace(',', '.'))
    return isNaN(n) ? fallback : n
  }

  /* ── Voreinstellung je Auswahl ─────────────────────────────── */
  function basisWerte (auswahl) {
    var w = Object.assign({ jahre: 10 }, VORLAGEN.basis.werte)
    if (auswahl !== 'portfolio') {
      var p = props.filter(function (x) { return x.id === auswahl })[0]
      var e = p && C().wertEinstellung(p)
      if (e && e.modus === 'steigerung' && e.steigerung) w.wert = e.steigerung
    }
    return w
  }

  function laden () {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
      if (s && s.p) {
        state.auswahl = s.auswahl || 'portfolio'; state.p = s.p; state.vorlage = s.vorlage || ''
        state.basis = s.basis === 'uebernahme' ? 'uebernahme' : 'heute'
        state.modus = s.modus === 'faktor' ? 'faktor' : 'wert'
      }
    } catch (e) {}
    if (state.auswahl !== 'portfolio' && !props.some(function (x) { return x.id === state.auswahl })) state.auswahl = 'portfolio'
    if (!state.p) state.p = basisWerte(state.auswahl)
    PARAMS.forEach(function (d) { if (state.p[d.key] === undefined) state.p[d.key] = basisWerte(state.auswahl)[d.key] })
  }
  function merken () {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)) } catch (e) {}
  }

  /* ── Rechenkern ───────────────────────────────────────────────
     Eine Immobilie, Monat für Monat ab dem nächsten Monat.
     Rückgabe: Jahreszeilen und Exit-Kennzahlen.                   */
  // Monate zwischen zwei Monatsangaben
  function mDiff (a, b) {
    var x = String(a).split('-').map(Number), y = String(b).split('-').map(Number)
    return (x[0] * 12 + x[1]) - (y[0] * 12 + y[1])
  }

  // Was heute bereits an Vermögen entstanden ist:
  // aktueller Wert − Restschuld − alle Nebenkosten + kumulierter Cashflow.
  function vermoegenHeute (p) {
    var calc = C()
    var heute = calc.jetztMonat()
    var wert = calc.aktuellerWert(p) || 0
    var rs = calc.restschuld(p, heute) || 0
    var neben = Math.abs(calc.summeBis(p, 'ausgabe', heute)) +
                Math.abs(calc.summeBis(p, 'weitereAusgaben', heute))
    // Cashflow seit der Übernahme bis einschließlich heute
    var cf = 0
    var u = calc.uebernahme(p)
    var n = Math.max(0, mDiff(heute, u))
    for (var i = 0; i <= n; i++) cf += calc.cfTeile(p, calc.monatPlus(u, i)).cf
    return { wert: wert, restschuld: rs, nebenkosten: neben, cf: cf,
             summe: wert - rs - neben + cf }
  }

  function simuliere (p, par) {
    var calc = C()
    var heute = calc.jetztMonat()
    // Exit ab heute oder ab Übernahme der Immobilie
    var jahre = Math.max(1, Math.round(par.jahre))
    var N = jahre * 12
    if (state.basis === 'uebernahme') {
      var seit = Math.max(0, mDiff(heute, calc.uebernahme(p)))
      N = Math.max(1, jahre * 12 - seit)
    }
    var t = calc.cfTeile(p, heute)
    var W0 = calc.aktuellerWert(p) || 0
    var RS = calc.restschuld(p, heute) || 0
    var RS0 = RS

    var miete0  = (t.miete || 0) + (t.weitereMiete || 0)
    var nkm0    = Math.abs(t.miete || 0)   // Nettokaltmiete + NK-Vorauszahlung, Basis für den Faktor
    var kosten0 = (t.hausgeld || 0) + (t.grundsteuer || 0)          // negativ
    var rate    = Math.abs(t.bankrate || 0)
    var zins0   = Math.abs(t.zins || 0) + Math.abs(t.zins2 || 0)
    var satz    = RS > 0 && zins0 ? zins0 * 12 / RS : 0
    var ohneDarlehen = RS <= 0 && rate > 0                             // Darlehensrate ohne erfasste Restschuld
    var hinweise = []
    if (ohneDarlehen) hinweise.push('keine Restschuld erfasst – die Darlehensrate wird unverändert fortgeschrieben')
    if (RS > 0 && rate > 0 && !zins0) hinweise.push('kein Zins erfasst – die Darlehensrate wird vollständig als Tilgung gerechnet')

    var jahre = []
    var j = null
    var kumCf = 0
    for (var k = 1; k <= N; k++) {
      var y = Math.floor((k - 1) / 12)
      if (!j || j.idx !== y) {
        var bis = calc.monatPlus(heute, (y + 1) * 12)
        j = { idx: y, jahr: Number(bis.slice(0, 4)), bis: bis, miete: 0, nkm: 0, kosten: 0, zins: 0, tilgung: 0, cf: 0, wert: 0, restschuld: 0 }
        jahre.push(j)
      }
      var fM = Math.pow(1 + par.miete / 100, y)
      var fK = Math.pow(1 + par.kosten / 100, y)
      var miete  = miete0 * fM * (1 - par.ausfall / 100)
      var kosten = kosten0 * fK - par.instand * fK

      // Zinsbindung zählt ab dem Kaufdatum, nicht ab heute
      if (par.zinsbindung > 0 && RS > 0) {
        var seitKauf = Math.max(0, mDiff(heute, calc.uebernahme(p)))
        if (seitKauf + k > par.zinsbindung * 12) satz = par.anschluss / 100
      }

      var zins = 0, tilgung = 0
      if (ohneDarlehen) {
        zins = rate
      } else if (RS > 0.005 && rate > 0) {
        zins = RS * satz / 12
        tilgung = Math.min(RS, Math.max(0, rate - zins))
        RS -= tilgung
      }
      if (k % 12 === 0 && par.sonder > 0 && RS > 0.005) {
        var st = Math.min(RS, par.sonder)
        RS -= st
        tilgung += st
      }
      var cf = miete + kosten - zins - tilgung
      kumCf += cf

      j.miete += miete; j.kosten += kosten; j.zins += zins; j.tilgung += tilgung; j.cf += cf
      j.nkm += nkm0 * fM * (1 - par.ausfall / 100)
      j.wert = state.modus === 'faktor'
        ? (nkm0 * 12 * Math.pow(1 + par.miete / 100, y) * par.faktor)
        : W0 * Math.pow(1 + par.wert / 100, k / 12)
      j.restschuld = RS
    }

    var letzte = jahre[jahre.length - 1]
    var wertExit = state.modus === 'faktor'
      ? (letzte ? letzte.wert : 0)
      : W0 * Math.pow(1 + par.wert / 100, N / 12)
    var verkaufskosten = wertExit * par.verkauf / 100
    var erloes = wertExit - verkaufskosten - RS

    // Zehnjahresfrist (§ 23 EStG) ab dem Übernahmestichtag, tagesgenau
    var exitMonat = calc.monatPlus(heute, N)
    var st = calc.stichtag(p)
    var jetzt = new Date()
    var exitDatum = new Date(jetzt.getFullYear(), jetzt.getMonth() + N, jetzt.getDate())
    var fristEnde = null, innerhalbFrist = null
    if (st) {
      var t3 = st.split('-').map(Number)
      fristEnde = new Date(t3[0] + 10, t3[1] - 1, t3[2])
      innerhalbFrist = exitDatum < fristEnde
    }

    var vh = vermoegenHeute(p)
    return {
      p: p, jahre: jahre, N: N,
      vhWert: vh.wert, vhRest: vh.restschuld, vhNeben: vh.nebenkosten, vhCf: vh.cf, vermoegenHeute: vh.summe,
      W0: W0, RS0: RS0, EK0: W0 - RS0,
      cf0: miete0 + kosten0 - rate,
      wertExit: wertExit, restschuldExit: RS, verkaufskosten: verkaufskosten,
      erloes: erloes, kumCf: kumCf, exitMonat: exitMonat,
      stichtag: st, fristEnde: fristEnde, innerhalbFrist: innerhalbFrist,
      hinweise: hinweise
    }
  }

  // Mehrere Immobilien zu einem Ergebnis zusammenfassen
  function zusammen (liste) {
    var r = { jahre: [], W0: 0, RS0: 0, EK0: 0, cf0: 0, wertExit: 0, restschuldExit: 0, verkaufskosten: 0, erloes: 0, kumCf: 0,
              vhWert: 0, vhRest: 0, vhNeben: 0, vhCf: 0, vermoegenHeute: 0, einzeln: liste }
    liste.forEach(function (s) {
      ;['W0', 'RS0', 'EK0', 'cf0', 'wertExit', 'restschuldExit', 'verkaufskosten', 'erloes', 'kumCf',
        'vhWert', 'vhRest', 'vhNeben', 'vhCf', 'vermoegenHeute'].forEach(function (k) { r[k] += s[k] })
      s.jahre.forEach(function (j, i) {
        if (!r.jahre[i]) r.jahre[i] = { idx: j.idx, jahr: j.jahr, bis: j.bis, miete: 0, nkm: 0, kosten: 0, zins: 0, tilgung: 0, cf: 0, wert: 0, restschuld: 0 }
        ;['miete', 'nkm', 'kosten', 'zins', 'tilgung', 'cf', 'wert', 'restschuld'].forEach(function (k) { r.jahre[i][k] += j[k] })
      })
    })
    // Beim Exit „ab Übernahme" hat jede Immobilie ihren eigenen Horizont
    var laengste = liste.slice().sort(function (a, b) { return b.N - a.N })[0]
    if (laengste) { r.N = laengste.N; r.exitMonat = laengste.exitMonat }
    return r
  }

  // Eigenkapitalrendite p.a. ab heute (interner Zinsfuß der Monatszahlungen)
  function irrPa (r) {
    if (!(r.EK0 > 1)) return null
    var flows = [-r.EK0]
    r.jahre.forEach(function (j) { for (var m = 0; m < 12; m++) flows.push(j.cf / 12) })
    flows[flows.length - 1] += r.erloes
    function npv (rate) {
      var s = 0
      for (var i = 0; i < flows.length; i++) s += flows[i] / Math.pow(1 + rate, i)
      return s
    }
    var lo = -0.0999, hi = 0.2
    if (npv(lo) * npv(hi) > 0) return null
    for (var it = 0; it < 90; it++) {
      var mid = (lo + hi) / 2
      if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid
    }
    return (Math.pow(1 + (lo + hi) / 2, 12) - 1) * 100
  }

  function rechne (par) {
    var auswahl = state.auswahl === 'portfolio' ? props : props.filter(function (x) { return x.id === state.auswahl })
    var r = zusammen(auswahl.map(function (p) { return simuliere(p, par) }))
    r.irr = irrPa(r)
    // Vermögen bis Exit – dieselbe Rechnung wie heute, nur mit den
    // fortgeschriebenen Werten: Wert beim Exit abzüglich Verkaufskosten und
    // Restschuld, abzüglich aller Nebenkosten, plus Cashflow (bis heute und
    // bis zum Exit). Jede Position kommt genau einmal vor.
    r.vermoegenExit = r.wertExit - r.verkaufskosten - r.restschuldExit - r.vhNeben + r.vhCf + r.kumCf
    r.zuwachs = r.vermoegenExit - r.vermoegenHeute
    return r
  }

  /* ── Oberfläche ───────────────────────────────────────────── */
  function css () {
    if (document.getElementById('szCss')) return
    var st = document.createElement('style')
    st.id = 'szCss'
    st.textContent = [
      '.sz-kopf { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:22px; }',
      '.sz-kopf label { font-size:0.8rem; color:var(--muted); }',
      '.sz-select { background:var(--navy2); border:1px solid rgba(255,255,255,0.16); border-radius:9px; color:var(--white); font:500 0.88rem/1 Inter,sans-serif; padding:10px 12px; min-width:240px; color-scheme:dark; }',
      '.sz-vorlagen { display:flex; gap:6px; flex-wrap:wrap; margin-left:auto; }',
      '.sz-chip { background:transparent; border:1px solid rgba(255,255,255,0.16); border-radius:50px; color:var(--muted); font:500 0.8rem/1 Inter,sans-serif; padding:8px 14px; cursor:pointer; }',
      '.sz-chip:hover { color:var(--white); border-color:rgba(211,172,95,0.5); }',
      '.sz-chip.aktiv { background:rgba(211,172,95,0.14); color:var(--gold); border-color:rgba(211,172,95,0.5); }',
      '.sz-layout { display:grid; grid-template-columns:320px minmax(0,1fr); gap:22px; align-items:start; }',
      '.sz-panel { background:var(--navy2); border:1px solid rgba(255,255,255,0.112); border-radius:14px; padding:6px 18px 14px; position:sticky; top:84px; }',
      '.sz-gruppe { font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.6px; color:var(--muted); margin:16px 0 6px; }',
      '.sz-feld { display:grid; grid-template-columns:1fr 92px; align-items:center; gap:4px 10px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.06); }',
      '.sz-feld:last-child { border-bottom:none; }',
      '.sz-feld-lab { font-size:0.84rem; display:flex; align-items:center; gap:6px; }',
      '.sz-feld-ein { display:flex; align-items:center; gap:6px; justify-content:flex-end; }',
      '.sz-feld input[type=number] { width:100%; background:#101012; border:1px solid rgba(255,255,255,0.14); border-radius:7px; color:var(--white); font:500 0.86rem/1 Inter,sans-serif; padding:7px 8px; text-align:right; color-scheme:dark; }',
      '.sz-feld input[type=number]:focus { outline:none; border-color:rgba(211,172,95,0.6); }',
      '.sz-feld-einh { grid-column:2; font-size:0.7rem; color:var(--muted); text-align:right; }',
      '.sz-feld input[type=range] { grid-column:1 / -1; width:100%; accent-color:var(--gold); }',
      '.sz-feld.geaendert .sz-feld-lab::after { content:""; width:6px; height:6px; border-radius:50%; background:var(--gold); }',
      '.sz-schalter { display:flex; gap:4px; margin:2px 0 8px; background:#101012; border:1px solid rgba(255,255,255,0.1); border-radius:9px; padding:3px; }',
      '.sz-schalter button { flex:1; background:none; border:none; border-radius:7px; color:var(--muted); font:600 0.76rem/1 Inter,sans-serif; padding:7px 6px; cursor:pointer; }',
      '.sz-schalter button.aktiv { background:rgba(211,172,95,0.16); color:var(--gold); }',
      '.sz-feld.aus { display:none; }',
      '.sz-reset { margin-top:12px; width:100%; background:transparent; border:1px dashed rgba(255,255,255,0.18); border-radius:9px; color:var(--muted); font:500 0.8rem/1 Inter,sans-serif; padding:10px; cursor:pointer; }',
      '.sz-reset:hover { color:var(--gold); border-color:rgba(211,172,95,0.45); }',
      '.sz-start { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-bottom:14px; }',
      '.sz-start div { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:10px 14px; }',
      '.sz-start span { display:block; font-size:0.68rem; text-transform:uppercase; letter-spacing:0.4px; color:var(--muted); font-weight:600; }',
      '.sz-start b { font-size:0.95rem; font-weight:600; }',
      '.sz-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:18px; }',
      '.sz-kpis-4 { grid-template-columns:repeat(4,minmax(0,1fr)); }',
      '@media (max-width: 1200px) { .sz-kpis-4 { grid-template-columns:repeat(2,minmax(0,1fr)); } }',
      '.sz-kpi { background:var(--navy2); border:1px solid rgba(255,255,255,0.112); border-radius:12px; padding:14px 16px; }',
      '.sz-kpi.haupt { border-color:rgba(211,172,95,0.4); background:linear-gradient(180deg,rgba(211,172,95,0.08),rgba(211,172,95,0.02)); }',
      '.sz-kpi-lab { font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.4px; color:var(--muted); display:flex; align-items:center; gap:6px; }',
      '.sz-kpi-val { font-size:1.3rem; font-weight:700; letter-spacing:-0.3px; margin-top:6px; }',
      '.sz-kpi-val.gold { color:var(--gold); } .sz-kpi-val.green { color:var(--green); } .sz-kpi-val.red { color:var(--red); }',
      '.sz-kpi-sub { font-size:0.74rem; color:var(--muted); margin-top:4px; }',
      '.sz-kpi-sub b { font-weight:600; } .sz-kpi-sub .up { color:var(--green); } .sz-kpi-sub .down { color:var(--red); }',
      '.sz-hinweise { margin:0 0 18px; display:grid; gap:8px; }',
      '.sz-hinweis { font-size:0.8rem; color:var(--muted); background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-left:3px solid var(--gold); border-radius:8px; padding:10px 14px; line-height:1.5; }',
      '.sz-hinweis b { color:var(--white); font-weight:600; }',
      '.sz-charts { margin-bottom:18px; }',
      '.sz-tab-wrap { overflow-x:auto; border:1px solid rgba(255,255,255,0.088); border-radius:12px; background:var(--navy2); }',
      '.sz-tab { border-collapse:collapse; width:100%; min-width:860px; font-size:0.82rem; }',
      '.sz-tab th { font-size:0.66rem; text-transform:uppercase; letter-spacing:0.5px; color:var(--muted); font-weight:600; background:#26262b; padding:10px 12px; text-align:right; white-space:nowrap; }',
      '.sz-tab th:first-child, .sz-tab td:first-child { text-align:left; }',
      '.sz-tab td { padding:9px 12px; text-align:right; border-top:1px solid rgba(255,255,255,0.06); white-space:nowrap; font-variant-numeric:tabular-nums; }',
      '.sz-tab td.neg { color:var(--red); } .sz-tab td.pos { color:var(--green); }',
      '.sz-tab tr.sz-exit td { border-top:2px solid rgba(211,172,95,0.35); background:rgba(211,172,95,0.06); font-weight:600; }',
      '.sz-titel { display:flex; align-items:center; gap:9px; font-size:0.76rem; font-weight:700; text-transform:uppercase; letter-spacing:0.7px; margin:6px 0 12px; }',
      '.sz-titel::before { content:""; width:3px; height:13px; border-radius:2px; background:var(--gold); }',
      '.sz-disclaimer { font-size:0.74rem; color:rgba(155,150,140,0.8); margin-top:14px; line-height:1.5; }',
      '@media (max-width: 980px) { .sz-layout { grid-template-columns:minmax(0,1fr); } .sz-select { min-width:0; width:100%; } .sz-panel { position:static; } .sz-vorlagen { margin-left:0; } }'
    ].join('\n')
    document.head.appendChild(st)
  }

  // Kleiner Zweifach-Umschalter im Eingabefeld-Panel
  function schalter (id, optionen, aktiv) {
    return '<div class="sz-schalter" id="' + id + '">' +
      Object.keys(optionen).map(function (k) {
        return '<button type="button" data-w="' + k + '" class="' + (k === aktiv ? 'aktiv' : '') + '">' + esc(optionen[k]) + '</button>'
      }).join('') + '</div>'
  }

  function info (t) {
    return '<span class="ie-info" tabindex="0" role="button" aria-label="Erklärung"><span class="ie-info-pop">' + esc(t) + '</span></span>'
  }

  function aufbauen (host) {
    css()
    var optionen = '<option value="portfolio">Gesamtes Portfolio (' + props.length + ' Immobilien)</option>' +
      props.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.bezeichnung || 'Immobilie') + '</option>' }).join('')

    var gruppe = ''
    var felder = PARAMS.map(function (d) {
      var kopf = d.gruppe !== gruppe ? '<div class="sz-gruppe">' + esc(d.gruppe) + '</div>' : ''
      if (d.key === 'jahre') kopf += schalter('szBasis', EXIT_BASIS, state.basis)
      if (d.key === 'wert')  kopf += schalter('szModus', EXIT_MODUS, state.modus)
      gruppe = d.gruppe
      return kopf +
        '<div class="sz-feld" data-key="' + d.key + '">' +
          '<label class="sz-feld-lab" for="sz_' + d.key + '">' + esc(d.label) + info(d.info) + '</label>' +
          '<div class="sz-feld-ein"><input type="number" id="sz_' + d.key + '" min="' + d.min + '" max="' + d.max + '" step="' + d.step + '" inputmode="decimal" /></div>' +
          '<div class="sz-feld-einh">' + esc(d.einheit) + '</div>' +
          (d.slider ? '<input type="range" id="szr_' + d.key + '" min="' + d.min + '" max="' + d.max + '" step="' + d.step + '" />' : '') +
        '</div>'
    }).join('')

    host.innerHTML =
      '<div class="sz-kopf">' +
        '<label for="szAuswahl">Betrachtung</label>' +
        '<select class="sz-select" id="szAuswahl">' + optionen + '</select>' +
        '<div class="sz-vorlagen" id="szVorlagen">' +
          Object.keys(VORLAGEN).map(function (k) { return '<button type="button" class="sz-chip" data-v="' + k + '">' + VORLAGEN[k].label + '</button>' }).join('') +
        '</div>' +
      '</div>' +
      '<div class="sz-layout">' +
        '<aside class="sz-panel">' + felder +
          '<button type="button" class="sz-reset" id="szReset">Auf Basis zurücksetzen</button>' +
        '</aside>' +
        '<div class="sz-ergebnis" id="szErgebnis"></div>' +
      '</div>'

    var sel = host.querySelector('#szAuswahl')
    sel.value = state.auswahl
    sel.addEventListener('change', function () {
      state.auswahl = sel.value
      // Wertentwicklung der Immobilie übernehmen, übrige Annahmen behalten
      if (state.vorlage === 'basis') state.p.wert = basisWerte(state.auswahl).wert
      felderFuellen(); merken(); ausgeben()
    })

    PARAMS.forEach(function (d) {
      var inp = host.querySelector('#sz_' + d.key)
      var rng = host.querySelector('#szr_' + d.key)
      var setzen = function (v, quelle) {
        var n = zahl(v, null)
        if (n === null) return
        n = Math.min(d.max, Math.max(d.min, n))
        state.p[d.key] = n
        if (quelle !== inp) inp.value = n
        if (rng && quelle !== rng) rng.value = n
        state.vorlage = ''
        markiereVorlage(); merken(); ausgeben()
      }
      inp.addEventListener('input', function () { setzen(inp.value, inp) })
      inp.addEventListener('change', function () { inp.value = state.p[d.key] })
      if (rng) rng.addEventListener('input', function () { setzen(rng.value, rng) })
    })

    host.querySelectorAll('.sz-chip').forEach(function (b) {
      b.addEventListener('click', function () { vorlage(b.getAttribute('data-v')) })
    })
    ;[['szBasis', 'basis'], ['szModus', 'modus']].forEach(function (x) {
      var box = host.querySelector('#' + x[0])
      if (!box) return
      box.addEventListener('click', function (e) {
        var b = e.target.closest('button')
        if (!b) return
        state[x[1]] = b.getAttribute('data-w')
        box.querySelectorAll('button').forEach(function (n) { n.classList.toggle('aktiv', n === b) })
        modusFelder(); merken(); ausgeben()
      })
    })
    modusFelder()
    host.querySelector('#szReset').addEventListener('click', function () { vorlage('basis') })

    felderFuellen()
  }

  function vorlage (k) {
    var jahre = state.p.jahre
    state.p = Object.assign({ jahre: jahre }, VORLAGEN[k].werte)
    if (k === 'basis') state.p.wert = basisWerte(state.auswahl).wert
    state.vorlage = k
    felderFuellen(); merken(); ausgeben()
  }

  function markiereVorlage () {
    document.querySelectorAll('#szVorlagen .sz-chip').forEach(function (b) {
      b.classList.toggle('aktiv', b.getAttribute('data-v') === state.vorlage)
    })
    var basis = basisWerte(state.auswahl)
    PARAMS.forEach(function (d) {
      var f = document.querySelector('.sz-feld[data-key="' + d.key + '"]')
      if (f) f.classList.toggle('geaendert', d.key !== 'jahre' && Number(state.p[d.key]) !== Number(basis[d.key]))
    })
  }

  // Nur die Felder zeigen, die zum gewählten Modus passen
  function modusFelder () {
    PARAMS.forEach(function (d) {
      if (!d.nurModus) return
      var f = document.querySelector('.sz-feld[data-key="' + d.key + '"]')
      if (f) f.classList.toggle('aus', d.nurModus !== state.modus)
    })
  }

  function felderFuellen () {
    PARAMS.forEach(function (d) {
      var inp = document.getElementById('sz_' + d.key)
      var rng = document.getElementById('szr_' + d.key)
      if (inp) inp.value = state.p[d.key]
      if (rng) rng.value = state.p[d.key]
    })
    var sel = document.getElementById('szAuswahl')
    if (sel) sel.value = state.auswahl
    markiereVorlage()
  }

  /* ── Ergebnis ─────────────────────────────────────────────── */
  function kachel (label, wert, klasse, sub, infoText, haupt) {
    return '<div class="sz-kpi' + (haupt ? ' haupt' : '') + '"><div class="sz-kpi-lab">' + esc(label) + (infoText ? info(infoText) : '') + '</div>' +
      '<div class="sz-kpi-val ' + (klasse || '') + '">' + wert + '</div>' + (sub || '') + '</div>'
  }

  var zeichenTimer = null
  function ausgeben () {
    clearTimeout(zeichenTimer)
    zeichenTimer = setTimeout(ausgebenJetzt, 60)
  }

  function ausgebenJetzt () {
    var host = document.getElementById('szErgebnis')
    if (!host) return
    if (!props.length) { host.innerHTML = '<div class="ov-empty">Noch keine Immobilien im Portfolio.</div>'; return }

    var par = state.p
    var r = rechne(par)
    var exitJahr = r.exitMonat ? r.exitMonat.slice(0, 4) : ''

    var html = ''
    html += '<div class="sz-titel">Ausgangslage heute</div>'
    html += '<div class="sz-start">' +
      '<div><span>Wert heute</span><b>' + eur(r.W0) + '</b></div>' +
      '<div><span>Restschuld heute</span><b>' + eur(r.RS0) + '</b></div>' +
      '<div><span>Eigenkapital heute</span><b>' + eur(r.EK0) + '</b></div>' +
      '<div><span>Cashflow / Monat</span><b style="color:' + (r.cf0 < 0 ? 'var(--red)' : 'var(--green)') + '">' + eur(r.cf0) + '</b></div>' +
      '<div title="Aktueller Wert − Restschuld − alle Nebenkosten + bisher erwirtschafteter Cashflow">' +
        '<span>Vermögenszuwachs heute</span><b style="color:' + (r.vermoegenHeute < 0 ? 'var(--red)' : 'var(--gold)') + '">' + eur(r.vermoegenHeute) + '</b></div>' +
    '</div>'

    var basisTxt = state.basis === 'uebernahme' ? 'ab Übernahme' : 'ab heute'
    html += '<div class="sz-titel">Ergebnis beim Exit ' + esc(exitJahr) + ' (nach ' + par.jahre + ' ' +
      (par.jahre === 1 ? 'Jahr' : 'Jahren') + ' ' + basisTxt + ')</div>'
    html += '<div class="sz-kpis">' +
      kachel('Vermögen bis Exit', eur(r.vermoegenExit), 'gold', '',
        'Wert beim Exit − Verkaufskosten − Restschuld − alle Nebenkosten + Cashflow bis dahin. Jede Position zählt genau einmal.', true) +
      kachel('Vermögenszuwachs heute → Exit', eur(r.zuwachs), r.zuwachs < 0 ? 'red' : 'green', '',
        'Vermögen bis Exit abzüglich des heute bereits aufgebauten Vermögens.') +
      kachel('Eigenkapitalrendite p. a.', r.irr === null ? '–' : pct(r.irr), r.irr !== null && r.irr < 0 ? 'red' : '', '',
        'Interner Zinsfuß ab heute: heutiges Eigenkapital als Einsatz, monatliche Cashflows und der Verkaufserlös als Rückflüsse.') +
    '</div><div class="sz-kpis sz-kpis-4">' +
      kachel('Wert beim Exit', eur(r.wertExit), '', '',
        state.modus === 'faktor' ? 'Jahresnettokaltmiete im Exitjahr × Faktor ' + par.faktor : '') +
      kachel('Restschuld beim Exit', eur(r.restschuldExit)) +
      kachel('Verkaufserlös netto', eur(r.erloes), r.erloes < 0 ? 'red' : '', '',
        'Wert beim Exit − Verkaufskosten (' + pct(par.verkauf) + ' = ' + eur(r.verkaufskosten) + ') − Restschuld.') +
      kachel('Cashflow bis Exit', eur(r.kumCf), r.kumCf < 0 ? 'red' : 'green', '',
        'Summe aller monatlichen Cashflows bis zum Verkauf, nach Zins, Tilgung und Sondertilgungen.') +
    '</div>'

    // Hinweise: Spekulationsfrist und Datenlücken
    var hinweise = []
    var datum = function (d) { return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear() }
    var frist = r.einzeln.filter(function (s) { return s.innerhalbFrist === true })
    if (frist.length) {
      hinweise.push('<b>Verkauf innerhalb von zehn Jahren nach Übernahme</b> ' +
        frist.map(function (s) { return (state.auswahl === 'portfolio' ? esc(s.p.bezeichnung || 'Immobilie') + ' ' : '') + '(Frist endet am ' + datum(s.fristEnde) + ')' }).join(', ') +
        ': Ein Veräußerungsgewinn ist bei vermieteten Immobilien in der Regel einkommensteuerpflichtig (§ 23 EStG). Der Rechner zieht keine Steuern ab.')
    }
    if (state.basis === 'uebernahme') {
      var schonVorbei = r.einzeln.filter(function (s) { return s.N <= 1 })
      if (schonVorbei.length) {
        hinweise.push('<b>Haltedauer bereits erreicht</b>' +
          (state.auswahl === 'portfolio' ? ' bei ' + schonVorbei.map(function (s) { return esc(s.p.bezeichnung || 'Immobilie') }).join(', ') : '') +
          ': Der gewählte Zeitraum ab Übernahme liegt in der Vergangenheit – gerechnet wird mit dem nächstmöglichen Monat.')
      }
    }
    var ohneStichtag = r.einzeln.filter(function (s) { return !s.stichtag })
    if (ohneStichtag.length) {
      hinweise.push('<b>Übernahmestichtag fehlt</b>' +
        (state.auswahl === 'portfolio' ? ' bei ' + ohneStichtag.map(function (s) { return esc(s.p.bezeichnung || 'Immobilie') }).join(', ') : '') +
        ': Ohne ihn lässt sich die Zehnjahresfrist nicht prüfen. Eintragen in den Einstellungen der Immobilie (⚙).')
    }
    r.einzeln.forEach(function (s) {
      if (!s.hinweise.length) return
      hinweise.push('<b>' + esc(s.p.bezeichnung || 'Immobilie') + ':</b> ' + esc(s.hinweise.join('; ')) + '.')
    })
    if (r.einzeln.some(function (s) { return !s.W0 })) {
      hinweise.push('<b>Ohne Wert:</b> ' + r.einzeln.filter(function (s) { return !s.W0 }).map(function (s) { return esc(s.p.bezeichnung || 'Immobilie') }).join(', ') +
        ' – ohne Kaufpreis oder eigenen Wert geht die Immobilie mit 0 € in den Verkaufserlös ein.')
    }
    if (hinweise.length) html += '<div class="sz-hinweise">' + hinweise.map(function (h) { return '<div class="sz-hinweis">' + h + '</div>' }).join('') + '</div>'

    var Kc = K()
    html += '<div class="pc-grid sz-charts">' +
      Kc.karte({ id: 'szChartVermoegen', titel: 'Wert und Finanzierung je Jahr', info: 'Stand jeweils zum Jahresende. Beide Säulenteile zusammen ergeben den Wert der Immobilie.',
        legende: [{ c: Kc.farben.GOLD, t: 'Eigenkapital' }, { c: Kc.farben.BLAU, t: 'Restschuld' }] }) +
      Kc.karte({ id: 'szChartCf', titel: 'Cashflow je Jahr', info: 'Jahressumme nach Zins, Tilgung, Sondertilgung und Kosten. Die Linie zeigt den aufsummierten Cashflow.',
        legende: [{ c: Kc.farben.TEAL, t: 'Cashflow' }, { c: Kc.farben.TERRA, t: 'negativer Cashflow' }, { c: Kc.farben.GOLD, t: 'kumuliert', linie: true }] }) +
      Kc.karte({ id: 'szChartVerm', titel: 'Vermögen je Jahr', info: 'Wert abzüglich Restschuld und Nebenkosten, zuzüglich des bis dahin erwirtschafteten Cashflows.',
        legende: [{ c: Kc.farben.GOLD, t: 'Vermögen' }] }) +
      Kc.karte({ id: 'szChartMiete', titel: 'Mieteinnahmen je Jahr', info: 'Jahressumme nach angenommenem Mietausfall.',
        legende: [{ c: Kc.farben.TEAL, t: 'Mieteinnahmen' }] }) +
    '</div>'

    // Statt der Jahrestabelle: Kennzahlen über die Laufzeit und ein dritter Graph
    var summeMiete = r.jahre.reduce(function (a, j) { return a + j.miete }, 0)
    var summeKosten = r.jahre.reduce(function (a, j) { return a + j.kosten }, 0)
    var summeZins = r.jahre.reduce(function (a, j) { return a + j.zins }, 0)
    var summeTilgung = r.jahre.reduce(function (a, j) { return a + j.tilgung }, 0)
    var wertZuwachs = r.wertExit - r.W0
    html += '<div class="sz-titel">Über die gesamte Laufzeit</div>'
    html += '<div class="sz-kpis sz-kpis-4">' +
      kachel('Mieteinnahmen', eur(summeMiete), 'green') +
      kachel('Laufende Kosten', eur(summeKosten), 'red') +
      kachel('Gezahlte Zinsen', eur(-summeZins), 'red') +
      kachel('Tilgung', eur(summeTilgung), '', '', 'Tilgung baut Eigenkapital auf – sie mindert den Cashflow, nicht das Vermögen.') +
    '</div>'
    html += '<div class="sz-kpis sz-kpis-4">' +
      kachel('Wertzuwachs', eur(wertZuwachs), wertZuwachs < 0 ? 'red' : 'green', '', 'Wert beim Exit abzüglich Wert heute.') +
      kachel('Entschuldung', eur(Math.max(0, r.RS0 - r.restschuldExit)), '', '', 'Um so viel sinkt die Restschuld bis zum Exit.') +
      kachel('Cashflow je Monat ⌀', eur(r.N ? r.kumCf / r.N : 0), (r.kumCf < 0 ? 'red' : 'green')) +
      kachel('Vermögen heute', eur(r.vermoegenHeute), 'gold', '',
        'Aktueller Wert − Restschuld − alle Nebenkosten + bisher erwirtschafteter Cashflow.') +
    '</div>'

    html += '<p class="sz-disclaimer">Ausgangspunkt sind die Werte des laufenden Monats aus der Liquiditätsplanung (Miete, Hausgeld, Grundsteuer, Zins, Tilgung) ' +
      'und der aktuelle Wert jeder Immobilie. Das erste Jahr umfasst die nächsten zwölf Monate. Modellrechnung ohne Steuern, ohne Gewähr – keine Anlage- oder Steuerberatung.</p>'

    host.innerHTML = html

    // Charts
    var labels = ['heute'].concat(r.jahre.map(function (j) { return "'" + String(j.jahr).slice(2) }))
    var ekWerte = [Math.max(0, r.W0 - r.RS0)].concat(r.jahre.map(function (j) { return Math.max(0, j.wert - j.restschuld) }))
    var rsWerte = [Math.min(r.RS0, r.W0 || r.RS0)].concat(r.jahre.map(function (j) { return j.wert ? Math.min(j.restschuld, j.wert) : j.restschuld }))
    var plotV = document.querySelector('#szChartVermoegen .pc-plot')
    if (plotV) Kc.saeulen(plotV, {
      labels: labels, gestapelt: true, aktuell: labels.length - 1, wertOben: true,
      serien: [{ name: 'Restschuld', farbe: Kc.farben.BLAU, werte: rsWerte }, { name: 'Eigenkapital', farbe: Kc.farben.GOLD, werte: ekWerte }],
      tipTitel: function (i) { return i === 0 ? 'Heute' : 'Jahr ' + i + ' · ' + r.jahre[i - 1].bis.slice(5, 7) + '/' + r.jahre[i - 1].jahr },
      tipExtra: function (i) { return [{ c: 'transparent', t: 'Wert', v: eur(i === 0 ? r.W0 : r.jahre[i - 1].wert) }] },
      aria: 'Wert und Finanzierung je Jahr'
    })
    var kumW = [], s = 0
    r.jahre.forEach(function (j) { s += j.cf; kumW.push(s) })
    var vermW = [], lauf = 0
    r.jahre.forEach(function (j) {
      lauf += j.cf
      vermW.push(j.wert - j.restschuld - r.vhNeben + r.vhCf + lauf)
    })
    var plotVm = document.querySelector('#szChartVerm .pc-plot')
    if (plotVm) Kc.saeulen(plotVm, {
      labels: r.jahre.map(function (j) { return "'" + String(j.jahr).slice(2) }),
      serien: [{ name: 'Vermögen', farbe: Kc.farben.GOLD, werte: vermW }],
      aktuell: r.jahre.length - 1, wertOben: true,
      tipTitel: function (i) { return 'Jahr ' + (i + 1) + ' · bis ' + r.jahre[i].bis.slice(5, 7) + '/' + r.jahre[i].jahr },
      aria: 'Vermögen je Jahr'
    })
    var plotM = document.querySelector('#szChartMiete .pc-plot')
    if (plotM) Kc.saeulen(plotM, {
      labels: r.jahre.map(function (j) { return "'" + String(j.jahr).slice(2) }),
      serien: [{ name: 'Mieteinnahmen', farbe: Kc.farben.TEAL, werte: r.jahre.map(function (j) { return j.miete }) }],
      tipTitel: function (i) { return 'Jahr ' + (i + 1) + ' · bis ' + r.jahre[i].bis.slice(5, 7) + '/' + r.jahre[i].jahr },
      aria: 'Mieteinnahmen je Jahr'
    })
    var plotC = document.querySelector('#szChartCf .pc-plot')
    if (plotC) Kc.saeulen(plotC, {
      labels: r.jahre.map(function (j) { return "'" + String(j.jahr).slice(2) }),
      serien: [{ name: 'Cashflow', farbe: Kc.farben.TEAL, farbeNeg: Kc.farben.TERRA, werte: r.jahre.map(function (j) { return j.cf }) }],
      linie: { name: 'kumuliert', farbe: Kc.farben.GOLD, werte: kumW },
      tipTitel: function (i) { return 'Jahr ' + (i + 1) + ' · bis ' + r.jahre[i].bis.slice(5, 7) + '/' + r.jahre[i].jahr },
      aria: 'Cashflow je Jahr'
    })
  }

  window.IESzenario = {
    zeigen: function (properties) {
      props = properties || []
      var host = document.getElementById('szWrap')
      if (!host || !window.IECalc || !window.IEChart) return
      if (!gebaut) {
        laden()
        aufbauen(host)
        gebaut = true
      }
      ausgeben()
    },
    // für Tests
    _simuliere: simuliere, _rechne: function (par, auswahl, p) { props = p; state.auswahl = auswahl; return rechne(par) }
  }
})()
