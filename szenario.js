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
    { key: 'jahre',       gruppe: 'Zeitraum',     label: 'Verkauf (Exit) nach',            einheit: 'Jahren', min: 1,  max: 30,    step: 1,    slider: true,
      info: 'Nach so vielen Jahren ab heute wird der Verkauf angenommen. Bis dahin laufen Miete, Kosten und Finanzierung weiter.' },
    { key: 'wert',        gruppe: 'Markt',        label: 'Wertentwicklung',                einheit: '% / Jahr', min: -10, max: 15, step: 0.1,
      info: 'Jährliche Veränderung des Immobilienwerts ab dem heutigen Wert. Negativ = Wertverlust.' },
    { key: 'miete',       gruppe: 'Markt',        label: 'Mietsteigerung',                 einheit: '% / Jahr', min: -5, max: 10,  step: 0.1,
      info: 'Die Miete steigt jeweils zum Beginn eines neuen Jahres um diesen Satz (z. B. Index- oder Staffelmiete).' },
    { key: 'kosten',      gruppe: 'Markt',        label: 'Kostensteigerung',               einheit: '% / Jahr', min: -5, max: 10,  step: 0.1,
      info: 'Jährliche Steigerung von Hausgeld, Grundsteuer und Instandhaltung.' },
    { key: 'ausfall',     gruppe: 'Markt',        label: 'Mietausfall / Leerstand',        einheit: '%',       min: 0,  max: 50,    step: 0.5,
      info: 'Anteil der Mieteinnahmen, der im Schnitt ausfällt – durch Leerstand, Mieterwechsel oder Zahlungsausfall.' },
    { key: 'zinsbindung', gruppe: 'Finanzierung', label: 'Zinsbindung endet nach',         einheit: 'Jahren', min: 0,  max: 30,    step: 1,
      info: '0 = der heutige Zinssatz gilt bis zum Exit. Sonst wird ab diesem Zeitpunkt mit dem Anschlusszins gerechnet; die Bankrate bleibt gleich, nur die Aufteilung in Zins und Tilgung ändert sich.' },
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
    basis:        { label: 'Basis',        werte: { wert: 2, miete: 2, kosten: 2, ausfall: 0, zinsbindung: 0, anschluss: 4,   sonder: 0, instand: 0, verkauf: 3 } },
    vorsichtig:   { label: 'Vorsichtig',   werte: { wert: 0, miete: 1, kosten: 3, ausfall: 5, zinsbindung: 5, anschluss: 5.5, sonder: 0, instand: 50, verkauf: 6 } },
    optimistisch: { label: 'Optimistisch', werte: { wert: 3, miete: 3, kosten: 1.5, ausfall: 0, zinsbindung: 0, anschluss: 3, sonder: 0, instand: 0, verkauf: 3 } },
  }

  var state = { auswahl: 'portfolio', p: null, vorlage: 'basis' }
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
      if (s && s.p) { state.auswahl = s.auswahl || 'portfolio'; state.p = s.p; state.vorlage = s.vorlage || '' }
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
  function simuliere (p, par) {
    var calc = C()
    var heute = calc.jetztMonat()
    var N = Math.max(1, Math.round(par.jahre)) * 12
    var t = calc.cfTeile(p, heute)
    var W0 = calc.aktuellerWert(p) || 0
    var RS = calc.restschuld(p, heute) || 0
    var RS0 = RS

    var miete0  = (t.miete || 0) + (t.weitereMiete || 0)
    var kosten0 = (t.hausgeld || 0) + (t.grundsteuer || 0)          // negativ
    var rate    = Math.abs(t.bankrate || 0)
    var zins0   = Math.abs(t.zins || 0)
    var satz    = RS > 0 && zins0 ? zins0 * 12 / RS : 0
    var ohneDarlehen = RS <= 0 && rate > 0                             // Bankrate ohne erfasste Restschuld
    var hinweise = []
    if (ohneDarlehen) hinweise.push('keine Restschuld erfasst – die Bankrate wird unverändert fortgeschrieben')
    if (RS > 0 && rate > 0 && !zins0) hinweise.push('kein Zins erfasst – die Bankrate wird vollständig als Tilgung gerechnet')

    var jahre = []
    var j = null
    var kumCf = 0
    for (var k = 1; k <= N; k++) {
      var y = Math.floor((k - 1) / 12)
      if (!j || j.idx !== y) {
        var bis = calc.monatPlus(heute, (y + 1) * 12)
        j = { idx: y, jahr: Number(bis.slice(0, 4)), bis: bis, miete: 0, kosten: 0, zins: 0, tilgung: 0, cf: 0, wert: 0, restschuld: 0 }
        jahre.push(j)
      }
      var fM = Math.pow(1 + par.miete / 100, y)
      var fK = Math.pow(1 + par.kosten / 100, y)
      var miete  = miete0 * fM * (1 - par.ausfall / 100)
      var kosten = kosten0 * fK - par.instand * fK

      if (par.zinsbindung > 0 && k > par.zinsbindung * 12 && RS > 0) satz = par.anschluss / 100

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
      j.wert = W0 * Math.pow(1 + par.wert / 100, k / 12)
      j.restschuld = RS
    }

    var wertExit = W0 * Math.pow(1 + par.wert / 100, N / 12)
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

    return {
      p: p, jahre: jahre, N: N,
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
    var r = { jahre: [], W0: 0, RS0: 0, EK0: 0, cf0: 0, wertExit: 0, restschuldExit: 0, verkaufskosten: 0, erloes: 0, kumCf: 0, einzeln: liste }
    liste.forEach(function (s) {
      ;['W0', 'RS0', 'EK0', 'cf0', 'wertExit', 'restschuldExit', 'verkaufskosten', 'erloes', 'kumCf'].forEach(function (k) { r[k] += s[k] })
      s.jahre.forEach(function (j, i) {
        if (!r.jahre[i]) r.jahre[i] = { idx: j.idx, jahr: j.jahr, bis: j.bis, miete: 0, kosten: 0, zins: 0, tilgung: 0, cf: 0, wert: 0, restschuld: 0 }
        ;['miete', 'kosten', 'zins', 'tilgung', 'cf', 'wert', 'restschuld'].forEach(function (k) { r.jahre[i][k] += j[k] })
      })
    })
    if (liste[0]) { r.N = liste[0].N; r.exitMonat = liste[0].exitMonat }
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
    r.vermoegenExit = r.erloes + r.kumCf
    r.zuwachs = r.vermoegenExit - r.EK0
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
    '</div>'

    html += '<div class="sz-titel">Ergebnis beim Exit ' + esc(exitJahr) + ' (nach ' + par.jahre + ' ' + (par.jahre === 1 ? 'Jahr' : 'Jahren') + ')</div>'
    html += '<div class="sz-kpis">' +
      kachel('Vermögen beim Exit', eur(r.vermoegenExit), 'gold', '',
        'Verkaufserlös nach Ablösung der Restschuld plus alle bis dahin erwirtschafteten Cashflows.', true) +
      kachel('Vermögenszuwachs', eur(r.zuwachs), r.zuwachs < 0 ? 'red' : 'green', '',
        'Vermögen beim Exit abzüglich des heute gebundenen Eigenkapitals (Wert heute − Restschuld heute).') +
      kachel('Eigenkapitalrendite p. a.', r.irr === null ? '–' : pct(r.irr), r.irr !== null && r.irr < 0 ? 'red' : '', '',
        'Interner Zinsfuß ab heute: heutiges Eigenkapital als Einsatz, monatliche Cashflows und der Verkaufserlös als Rückflüsse.') +
    '</div><div class="sz-kpis sz-kpis-4">' +
      kachel('Wert beim Exit', eur(r.wertExit)) +
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
    '</div>'

    // Jahrestabelle
    var kum = 0
    var zeilen = r.jahre.map(function (j, i) {
      kum += j.cf
      var letzte = i === r.jahre.length - 1
      var ek = j.wert - j.restschuld
      return '<tr' + (letzte ? ' class="sz-exit"' : '') + '>' +
        '<td>Jahr ' + (i + 1) + ' <span style="color:var(--muted)">· bis ' + j.bis.slice(5, 7) + '/' + j.bis.slice(2, 4) + '</span>' + (letzte ? ' · Exit' : '') + '</td>' +
        '<td>' + eur(j.miete) + '</td>' +
        '<td class="' + (j.kosten < -0.5 ? 'neg' : '') + '">' + eur(j.kosten) + '</td>' +
        '<td class="' + (j.zins > 0.5 ? 'neg' : '') + '">' + eur(-j.zins) + '</td>' +
        '<td>' + eur(-j.tilgung) + '</td>' +
        '<td class="' + (j.cf < -0.5 ? 'neg' : 'pos') + '">' + eur(j.cf) + '</td>' +
        '<td>' + eur(kum) + '</td>' +
        '<td>' + eur(j.wert) + '</td>' +
        '<td>' + eur(j.restschuld) + '</td>' +
        '<td>' + eur(ek) + '</td>' +
      '</tr>'
    }).join('')
    html += '<div class="sz-titel">Jahr für Jahr</div>' +
      '<div class="sz-tab-wrap"><table class="sz-tab"><thead><tr>' +
        '<th>Zeitraum</th><th>Mieteinnahmen</th><th>Laufende Kosten</th><th>Zins</th><th>Tilgung</th><th>Cashflow</th><th>Cashflow kumuliert</th><th>Wert</th><th>Restschuld</th><th>Eigenkapital</th>' +
      '</tr></thead><tbody>' + zeilen + '</tbody></table></div>'

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
