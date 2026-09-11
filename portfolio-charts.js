/* ══════════════════════════════════════════════════════════════
   Immo.Expert – Portfolio-Graphen (reines SVG, ohne Fremdbibliothek)

   Darstellung auf Jahresbasis: Bestandsgrößen (Wert, Restschuld) zum
   Jahresende, Flussgrößen (Miete, Cashflow, Tilgung) als Jahressumme.

   Farbwahl geprüft mit dem Validator der dataviz-Vorgaben
   (dunkel, Fläche #18181b): Helligkeitsband, Sättigung, Farbfehlsichtigkeit,
   Normalsicht und Kontrast alle bestanden.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict'

  var S1 = '#d3ac5f'   // Gold       – Eigenkapital / Miete / Rendite
  var S2 = '#6a9bf5'   // Blau       – Fremdkapital / Hausgeld / Restschuld
  var S3 = '#e0705f'   // Terrakotta – Bankrate / Tilgung
  var INK = '#f1eee7', INK2 = '#9b968c', GRID = 'rgba(255,255,255,0.10)', SURF = '#18181b'

  var JAHRE_ZURUECK = 4, JAHRE_VOR = 2, MAX_JAHRE = 12

  function eur (n, cent) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR',
      minimumFractionDigits: cent ? 2 : 0, maximumFractionDigits: cent ? 2 : 0 }).format(n || 0)
  }
  function pct (n) {
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n || 0) + ' %'
  }
  function kurz (n) {
    var a = Math.abs(n)
    if (a >= 1000000) return (n / 1000000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Mio'
    if (a >= 1000)    return Math.round(n / 1000) + 'k'
    return String(Math.round(n))
  }
  function esc (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
  function kuerze (s, n) {
    s = String(s == null ? '' : s)
    return s.length > n ? s.slice(0, n - 1) + '…' : s
  }

  // Balken mit abgerundetem Datenende, am Nullpunkt verankert
  function balken (x, w, y0, y1, r) {
    var oben = y1 < y0
    var h = Math.abs(y1 - y0)
    if (h < 0.5) return ''
    var rr = Math.min(r, h, w / 2)
    return oben
      ? `M${x},${y0} L${x},${y0 - h + rr} Q${x},${y0 - h} ${x + rr},${y0 - h} L${x + w - rr},${y0 - h} Q${x + w},${y0 - h} ${x + w},${y0 - h + rr} L${x + w},${y0} Z`
      : `M${x},${y0} L${x},${y0 + h - rr} Q${x},${y0 + h} ${x + rr},${y0 + h} L${x + w - rr},${y0 + h} Q${x + w},${y0 + h} ${x + w},${y0 + h - rr} L${x + w},${y0} Z`
  }

  // Waagerechter Balken, links am Nullpunkt verankert
  function balkenH (y, h, x0, x1, r) {
    var w = Math.max(0, x1 - x0)
    if (w < 0.5) return ''
    var rr = Math.min(r, w, h / 2)
    return `M${x0},${y} L${x0 + w - rr},${y} Q${x0 + w},${y} ${x0 + w},${y + rr} L${x0 + w},${y + h - rr} Q${x0 + w},${y + h} ${x0 + w - rr},${y + h} L${x0},${y + h} Z`
  }

  function achsenTicks (min, max, n) {
    var span = max - min || 1
    var roh = span / n
    var mag = Math.pow(10, Math.floor(Math.log10(roh)))
    var schritt = [1, 2, 2.5, 5, 10].map(function (f) { return f * mag })
      .filter(function (v) { return v >= roh })[0] || 10 * mag
    var start = Math.floor(min / schritt) * schritt
    var out = []
    for (var v = start; v <= max + schritt * 0.001; v += schritt) out.push(v)
    // Der oberste Strich muss den Höchstwert immer einschließen,
    // sonst zeichnen Linien und Flächen über die Achse hinaus.
    if (out.length && out[out.length - 1] < max) out.push(out[out.length - 1] + schritt)
    if (!out.length) out.push(start, start + schritt)
    return out
  }

  function legende (items) {
    return '<div class="pc-legend">' + items.map(function (i) {
      return '<span class="pc-leg"><i style="background:' + i.c + '"></i>' + esc(i.t) + '</span>'
    }).join('') + '</div>'
  }

  function huelle (id, titel, unter, legendeHtml) {
    return '<div class="pc-card" id="' + id + '">' +
      '<div class="pc-head">' +
        '<div><div class="pc-title">' + esc(titel) + '</div>' +
        '<div class="pc-sub">' + esc(unter) + '</div></div>' +
        '<button class="pc-tbl-btn" type="button">Tabelle</button>' +
      '</div>' + legendeHtml +
      '<div class="pc-plot"><div class="pc-tip" hidden></div></div>' +
      '<div class="pc-table" hidden></div></div>'
  }

  function verdrahten (root, daten, spalten, kopf, schluessel) {
    var btn = root.querySelector('.pc-tbl-btn')
    var tbl = root.querySelector('.pc-table')
    btn.addEventListener('click', function () {
      var zu = tbl.hasAttribute('hidden')
      if (zu) {
        tbl.innerHTML = '<table><thead><tr><th>' + esc(kopf || 'Jahr') + '</th>' +
          spalten.map(function (c) { return '<th class="ta-r">' + esc(c.t) + '</th>' }).join('') +
          '</tr></thead><tbody>' + daten.map(function (d) {
            return '<tr><td>' + esc(schluessel ? schluessel(d) : d.jahr) + '</td>' +
              spalten.map(function (c) { return '<td class="ta-r">' + esc(c.f ? c.f(d) : eur(c.v(d))) + '</td>' }).join('') + '</tr>'
          }).join('') + '</tbody></table>'
        tbl.removeAttribute('hidden'); btn.textContent = 'Tabelle ausblenden'
      } else { tbl.setAttribute('hidden', ''); btn.textContent = 'Tabelle' }
    })
  }

  /* ── Datenaufbereitung ───────────────────────────────────── */

  function jahresliste (props) {
    var jetztJ = new Date().getFullYear()
    var start = jetztJ - JAHRE_ZURUECK
    var frueh = null
    ;(props || []).forEach(function (p) {
      var y = Number(String(window.IECalc.uebernahme(p)).slice(0, 4))
      if (y && (frueh === null || y < frueh)) frueh = y
    })
    if (frueh !== null && frueh > start) start = frueh
    if (jetztJ + JAHRE_VOR - start + 1 > MAX_JAHRE) start = jetztJ + JAHRE_VOR - MAX_JAHRE + 1
    var out = []
    for (var j = start; j <= jetztJ + JAHRE_VOR; j++) out.push(j)
    return out
  }

  function tilgungBis (props, monat) {
    var s = 0
    ;(props || []).forEach(function (p) {
      s += Math.abs(window.IECalc.summeBis(p, 'tilgung', monat))
    })
    return s
  }

  // Ein Eintrag je Jahr
  function jahresDaten (props) {
    var C = window.IECalc
    var jetztJ = new Date().getFullYear()
    var jahre = jahresliste(props)
    return jahre.map(function (j) {
      var monate = []
      for (var m = 1; m <= 12; m++) monate.push(j + '-' + String(m).padStart(2, '0'))
      var reihe = C.reihe(props || [], monate)
      var ende = reihe[11]
      var sum = function (k) { return reihe.reduce(function (s, r) { return s + r[k] }, 0) }
      return {
        jahr: j,
        wert: ende.wert,
        fremdkapital: ende.fremdkapital,
        eigenkapital: ende.eigenkapital,
        miete: sum('miete'),
        hausgeld: sum('hausgeld'),
        bankrate: sum('bankrate'),
        cf: sum('cf'),
        tilgung: Math.max(0, tilgungBis(props, j + '-12') - tilgungBis(props, (j - 1) + '-12')),
        prognose: j >= jetztJ
      }
    })
  }

  // Ein Eintrag je Immobilie (Stand heute)
  function objektDaten (props) {
    var C = window.IECalc
    var m = C.jetztMonat()
    return (props || []).map(function (p) {
      var t = C.cfTeile(p, m)
      var kp = C.kaufpreis(p)
      var basis = Number(p.wert) > 0 ? Number(p.wert) : kp
      var jahresMiete = (t.miete + t.weitereMiete) * 12
      return {
        name: p.bezeichnung || 'Immobilie',
        basis: basis,
        miete: jahresMiete,
        cf: t.cf * 12,
        rendite: basis > 0 ? (jahresMiete / basis) * 100 : 0
      }
    }).filter(function (o) { return o.basis > 0 })
      .sort(function (a, b) { return b.rendite - a.rendite })
  }

  /* ── Graph 1: Portfoliowert (Jahresende) ─────────────────── */
  function zeichneAum (root, daten) {
    var plot = root.querySelector('.pc-plot')
    var W = Math.max(plot.clientWidth || 640, 320), H = 268
    var pl = 62, pr = 14, pt = 14, pb = 30
    var iw = W - pl - pr, ih = H - pt - pb
    var maxW = Math.max.apply(null, daten.map(function (d) { return d.wert })) || 1
    var ticks = achsenTicks(0, maxW * 1.08, 4)
    var top = ticks[ticks.length - 1] || 1
    var x = function (i) { return pl + (daten.length === 1 ? iw / 2 : iw * i / (daten.length - 1)) }
    var y = function (v) { return pt + ih - (v / top) * ih }
    var jetztJ = new Date().getFullYear()
    var ji = daten.findIndex(function (d) { return d.jahr === jetztJ })

    function flaeche (unten, oben) {
      var a = daten.map(function (d, i) { return (i ? 'L' : 'M') + x(i) + ',' + y(oben(d)) }).join(' ')
      var b = daten.slice().reverse().map(function (d, i) {
        var j = daten.length - 1 - i
        return 'L' + x(j) + ',' + y(unten(daten[j]))
      }).join(' ')
      return a + ' ' + b + ' Z'
    }
    function linie (f) {
      return daten.map(function (d, i) { return (i ? 'L' : 'M') + x(i) + ',' + y(f(d)) }).join(' ')
    }

    var gitter = ticks.map(function (t) {
      return '<line x1="' + pl + '" y1="' + y(t) + '" x2="' + (W - pr) + '" y2="' + y(t) + '" stroke="' + GRID + '" stroke-width="1"/>' +
             '<text x="' + (pl - 10) + '" y="' + (y(t) + 4) + '" text-anchor="end" fill="' + INK2 + '" font-size="11">' + kurz(t) + '</text>'
    }).join('')

    var xlab = daten.map(function (d, i) {
      return '<text x="' + x(i) + '" y="' + (H - 9) + '" text-anchor="middle" fill="' + INK2 + '" font-size="11">' + d.jahr + '</text>'
    }).join('')

    var heute = ji >= 0
      ? '<line x1="' + x(ji) + '" y1="' + pt + '" x2="' + x(ji) + '" y2="' + (pt + ih) + '" stroke="' + INK2 + '" stroke-width="1" stroke-dasharray="3 3" opacity="0.55"/>'
      : ''

    var heuteWert = ji >= 0 ? daten[ji].wert : daten[daten.length - 1].wert

    plot.insertAdjacentHTML('afterbegin',
      '<svg class="pc-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="Entwicklung des Portfoliowertes je Jahr">' +
        gitter + heute +
        '<path d="' + flaeche(function (d) { return d.fremdkapital }, function (d) { return d.wert }) + '" fill="' + S1 + '" opacity="0.85"/>' +
        '<path d="' + flaeche(function () { return 0 }, function (d) { return d.fremdkapital }) + '" fill="' + S2 + '" opacity="0.85"/>' +
        '<path d="' + linie(function (d) { return d.fremdkapital }) + '" fill="none" stroke="' + SURF + '" stroke-width="2"/>' +
        '<path d="' + linie(function (d) { return d.wert }) + '" fill="none" stroke="' + INK + '" stroke-width="2"/>' +
        xlab +
        '<g class="pc-cross" opacity="0"><line y1="' + pt + '" y2="' + (pt + ih) + '" stroke="' + INK + '" stroke-width="1"/>' +
          '<circle r="5" fill="' + SURF + '" stroke="' + INK + '" stroke-width="2"/></g>' +
      '</svg>')

    root.querySelector('.pc-legend').insertAdjacentHTML('beforebegin',
      '<div class="pc-hero"><span class="pc-hero-val">' + eur(heuteWert) + '</span>' +
      '<span class="pc-hero-lab">Portfoliowert Ende ' + (ji >= 0 ? jetztJ : daten[daten.length - 1].jahr) + '</span></div>')

    hover(root, plot, daten, x, function (d) { return y(d.wert) }, function (d) {
      return '<b>' + d.jahr + (d.prognose ? ' · Prognose' : '') + '</b>' +
        row(S1, 'Eigenkapital', eur(d.eigenkapital)) +
        row(S2, 'Fremdkapital', eur(d.fremdkapital)) +
        row(INK, 'Gesamtwert', eur(d.wert))
    })
  }

  /* ── Graph 2: Cashflow je Jahr ───────────────────────────── */
  function zeichneCf (root, daten) {
    var plot = root.querySelector('.pc-plot')
    var W = Math.max(plot.clientWidth || 640, 320), H = 268
    var pl = 62, pr = 14, pt = 14, pb = 30
    var iw = W - pl - pr, ih = H - pt - pb
    var oben = Math.max.apply(null, daten.map(function (d) { return d.miete })) || 0
    var unten = Math.min.apply(null, daten.map(function (d) { return -(Math.abs(d.hausgeld) + Math.abs(d.bankrate)) })) || 0
    var maxA = Math.max(oben, Math.abs(unten), 1) * 1.25
    var ticks = achsenTicks(-maxA, maxA, 4)
    var y = function (v) { return pt + ih / 2 - (v / maxA) * (ih / 2) }
    var band = iw / daten.length
    var bw = Math.min(band * 0.52, 42)
    var xm = function (i) { return pl + band * i + band / 2 }
    var jetztJ = new Date().getFullYear()

    var gitter = ticks.map(function (t) {
      return '<line x1="' + pl + '" y1="' + y(t) + '" x2="' + (W - pr) + '" y2="' + y(t) + '" stroke="' + GRID + '" stroke-width="1"/>' +
             '<text x="' + (pl - 10) + '" y="' + (y(t) + 4) + '" text-anchor="end" fill="' + INK2 + '" font-size="11">' + kurz(t) + '</text>'
    }).join('')

    var null_ = '<line x1="' + pl + '" y1="' + y(0) + '" x2="' + (W - pr) + '" y2="' + y(0) + '" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>'

    var balkenHtml = daten.map(function (d, i) {
      var x0 = xm(i) - bw / 2
      var hg = -Math.abs(d.hausgeld), br = -Math.abs(d.bankrate)
      var op = d.prognose ? ' opacity="0.55"' : ''
      return '<path d="' + balken(x0, bw, y(0), y(d.miete), 4) + '" fill="' + S1 + '"' + op + '/>' +
             '<path d="' + balken(x0, bw, y(0), y(hg), 4) + '" fill="' + S2 + '"' + op + '/>' +
             '<path d="' + balken(x0, bw, y(hg) + 2, y(hg + br), 4) + '" fill="' + S3 + '"' + op + '/>'
    }).join('')

    var cfLinie = daten.map(function (d, i) { return (i ? 'L' : 'M') + xm(i) + ',' + y(d.cf) }).join('')
    var cfPunkte = daten.map(function (d, i) {
      return '<circle cx="' + xm(i) + '" cy="' + y(d.cf) + '" r="4.5" fill="' + SURF + '" stroke="' + INK + '" stroke-width="2"/>'
    }).join('')

    var xlab = daten.map(function (d, i) {
      return '<text x="' + xm(i) + '" y="' + (H - 9) + '" text-anchor="middle" fill="' + INK2 + '" font-size="11">' + d.jahr + '</text>'
    }).join('')

    var ji = daten.findIndex(function (d) { return d.jahr === jetztJ })
    var heute = ji >= 0
      ? '<rect x="' + (pl + band * ji) + '" y="' + pt + '" width="' + band + '" height="' + ih + '" fill="rgba(255,255,255,0.045)"/>'
      : ''

    plot.insertAdjacentHTML('afterbegin',
      '<svg class="pc-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="Cashflow des Gesamtportfolios je Jahr">' +
        heute + gitter + null_ + balkenHtml +
        '<path d="' + cfLinie + '" fill="none" stroke="' + INK + '" stroke-width="2"/>' + cfPunkte + xlab +
        '<g class="pc-cross" opacity="0"><line y1="' + pt + '" y2="' + (pt + ih) + '" stroke="' + INK + '" stroke-width="1"/></g>' +
      '</svg>')

    hover(root, plot, daten, xm, function () { return null }, function (d) {
      return '<b>' + d.jahr + (d.prognose ? ' · Prognose' : '') + '</b>' +
        row(S1, 'Miete', eur(d.miete)) +
        row(S2, 'Hausgeld', eur(d.hausgeld)) +
        row(S3, 'Bankrate', eur(d.bankrate)) +
        row(INK, 'Cashflow', eur(d.cf))
    })
  }

  /* ── Graph 3: Fremdkapital und Tilgung ───────────────────── */
  function zeichneTilgung (root, daten) {
    var plot = root.querySelector('.pc-plot')
    var W = Math.max(plot.clientWidth || 640, 320), H = 268
    var pl = 62, pr = 52, pt = 14, pb = 30
    var iw = W - pl - pr, ih = H - pt - pb
    var maxFk = Math.max.apply(null, daten.map(function (d) { return d.fremdkapital })) || 1
    var maxTg = Math.max.apply(null, daten.map(function (d) { return d.tilgung })) || 1
    var ticks = achsenTicks(0, maxFk * 1.1, 4)
    var top = ticks[ticks.length - 1] || 1
    var topT = maxTg * 1.35
    var band = iw / daten.length
    var bw = Math.min(band * 0.46, 34)
    var xm = function (i) { return pl + band * i + band / 2 }
    var y = function (v) { return pt + ih - (v / top) * ih }
    var yT = function (v) { return pt + ih - (v / topT) * ih }
    var jetztJ = new Date().getFullYear()
    var ji = daten.findIndex(function (d) { return d.jahr === jetztJ })

    var gitter = ticks.map(function (t) {
      return '<line x1="' + pl + '" y1="' + y(t) + '" x2="' + (W - pr) + '" y2="' + y(t) + '" stroke="' + GRID + '" stroke-width="1"/>' +
             '<text x="' + (pl - 10) + '" y="' + (y(t) + 4) + '" text-anchor="end" fill="' + INK2 + '" font-size="11">' + kurz(t) + '</text>'
    }).join('')

    // rechte Achse für die Jahrestilgung
    var tTicks = achsenTicks(0, topT, 3)
    var gitterR = tTicks.map(function (t) {
      return '<text x="' + (W - pr + 8) + '" y="' + (yT(t) + 4) + '" text-anchor="start" fill="' + INK2 + '" font-size="10">' + kurz(t) + '</text>'
    }).join('')

    var balkenHtml = daten.map(function (d, i) {
      var x0 = xm(i) - bw / 2
      var op = d.prognose ? ' opacity="0.55"' : ''
      return '<path d="' + balken(x0, bw, y(0), yT(d.tilgung), 4) + '" fill="' + S3 + '"' + op + '/>'
    }).join('')

    var fkLinie = daten.map(function (d, i) { return (i ? 'L' : 'M') + xm(i) + ',' + y(d.fremdkapital) }).join('')
    var fkPunkte = daten.map(function (d, i) {
      return '<circle cx="' + xm(i) + '" cy="' + y(d.fremdkapital) + '" r="4.5" fill="' + SURF + '" stroke="' + S2 + '" stroke-width="2"/>'
    }).join('')

    var xlab = daten.map(function (d, i) {
      return '<text x="' + xm(i) + '" y="' + (H - 9) + '" text-anchor="middle" fill="' + INK2 + '" font-size="11">' + d.jahr + '</text>'
    }).join('')

    var heute = ji >= 0
      ? '<rect x="' + (pl + band * ji) + '" y="' + pt + '" width="' + band + '" height="' + ih + '" fill="rgba(255,255,255,0.045)"/>'
      : ''

    plot.insertAdjacentHTML('afterbegin',
      '<svg class="pc-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="Restschuld und jährliche Tilgung">' +
        heute + gitter + gitterR + balkenHtml +
        '<path d="' + fkLinie + '" fill="none" stroke="' + S2 + '" stroke-width="2.5"/>' + fkPunkte + xlab +
        '<g class="pc-cross" opacity="0"><line y1="' + pt + '" y2="' + (pt + ih) + '" stroke="' + INK + '" stroke-width="1"/></g>' +
      '</svg>')

    var akt = ji >= 0 ? daten[ji] : daten[daten.length - 1]
    root.querySelector('.pc-legend').insertAdjacentHTML('beforebegin',
      '<div class="pc-hero"><span class="pc-hero-val">' + eur(akt.fremdkapital) + '</span>' +
      '<span class="pc-hero-lab">Restschuld Ende ' + akt.jahr + '</span></div>')

    hover(root, plot, daten, xm, function () { return null }, function (d) {
      return '<b>' + d.jahr + (d.prognose ? ' · Prognose' : '') + '</b>' +
        row(S2, 'Restschuld', eur(d.fremdkapital)) +
        row(S3, 'Tilgung im Jahr', eur(d.tilgung)) +
        row(INK, 'Eigenkapital', eur(d.eigenkapital))
    })
  }

  /* ── Graph 4: Mietrendite je Immobilie ───────────────────── */
  function zeichneRendite (root, objekte) {
    var plot = root.querySelector('.pc-plot')
    var W = Math.max(plot.clientWidth || 640, 320)
    var zeile = 34
    var pt = 10, pb = 26, pl = 150, pr = 70
    var H = Math.max(objekte.length * zeile + pt + pb, 150)
    var iw = W - pl - pr
    var maxR = Math.max.apply(null, objekte.map(function (o) { return o.rendite })) || 1
    var top = Math.max(maxR * 1.15, 1)
    var x = function (v) { return pl + (v / top) * iw }

    var summeMiete = objekte.reduce(function (s, o) { return s + o.miete }, 0)
    var summeBasis = objekte.reduce(function (s, o) { return s + o.basis }, 0)
    var schnitt = summeBasis > 0 ? (summeMiete / summeBasis) * 100 : 0

    var ticks = achsenTicks(0, top, 4)
    var gitter = ticks.map(function (t) {
      var beschriftet = t <= top * 0.97
      return '<line x1="' + x(t) + '" y1="' + pt + '" x2="' + x(t) + '" y2="' + (H - pb) + '" stroke="' + GRID + '" stroke-width="1"/>' +
             (beschriftet
               ? '<text x="' + x(t) + '" y="' + (H - 8) + '" text-anchor="middle" fill="' + INK2 + '" font-size="11">' +
                 t.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %</text>'
               : '')
    }).join('')

    // Werte stehen rechts in einer festen Spalte, damit sie nicht
    // mit der Durchschnittslinie kollidieren
    var reihen = objekte.map(function (o, i) {
      var yy = pt + i * zeile + 6
      var h = zeile - 14
      return '<path d="' + balkenH(yy, h, pl, x(o.rendite), 4) + '" fill="' + S1 + '"/>' +
             '<text x="' + (pl - 10) + '" y="' + (yy + h / 2 + 4) + '" text-anchor="end" fill="' + INK + '" font-size="11.5">' + esc(kuerze(o.name, 20)) + '</text>' +
             '<text x="' + (W - 6) + '" y="' + (yy + h / 2 + 4) + '" text-anchor="end" fill="' + INK + '" font-size="11" font-weight="600">' + pct(o.rendite) + '</text>'
    }).join('')

    var schnittLinie = schnitt > 0
      ? '<line x1="' + x(schnitt) + '" y1="' + pt + '" x2="' + x(schnitt) + '" y2="' + (H - pb) + '" stroke="' + INK + '" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.8"/>'
      : ''

    plot.insertAdjacentHTML('afterbegin',
      '<svg class="pc-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="Mietrendite je Immobilie">' +
        gitter + reihen + schnittLinie +
      '</svg>')

    root.querySelector('.pc-legend').insertAdjacentHTML('beforebegin',
      '<div class="pc-hero"><span class="pc-hero-val">' + pct(schnitt) + '</span>' +
      '<span class="pc-hero-lab">Portfolio im Schnitt</span></div>')
  }

  function row (c, t, v) {
    return '<span class="pc-tip-row"><i style="background:' + c + '"></i>' + esc(t) +
           '<b>' + esc(v) + '</b></span>'
  }

  // Fadenkreuz und Kurzinfo
  function hover (root, plot, daten, xf, yf, html) {
    var svg = plot.querySelector('svg')
    var tip = plot.querySelector('.pc-tip')
    var cross = svg.querySelector('.pc-cross')
    if (!cross) return
    var linie = cross.querySelector('line')
    var punkt = cross.querySelector('circle')

    function weg () { cross.setAttribute('opacity', '0'); tip.hidden = true }

    plot.addEventListener('mouseleave', weg)
    plot.addEventListener('mousemove', function (e) {
      var r = svg.getBoundingClientRect()
      var vb = svg.viewBox.baseVal
      var px = (e.clientX - r.left) / r.width * vb.width
      var best = 0, bd = Infinity
      daten.forEach(function (d, i) { var dd = Math.abs(xf(i) - px); if (dd < bd) { bd = dd; best = i } })
      var d = daten[best]
      linie.setAttribute('x1', xf(best)); linie.setAttribute('x2', xf(best))
      var yv = yf(d)
      if (punkt && yv !== null) { punkt.setAttribute('cx', xf(best)); punkt.setAttribute('cy', yv) }
      cross.setAttribute('opacity', '1')
      tip.innerHTML = html(d)
      tip.hidden = false
      var links = xf(best) / vb.width * r.width
      tip.style.left = Math.min(Math.max(links + 14, 8), r.width - tip.offsetWidth - 8) + 'px'
    })
  }

  /* ── Aufbau ─────────────────────────────────────────────── */
  function aufbauen (container, props) {
    if (!container || !window.IECalc) return
    var daten = jahresDaten(props || [])
    var objekte = objektDaten(props || [])
    var jetztJ = new Date().getFullYear()
    var prognoseHinweis = ' · ab ' + jetztJ + ' Prognose'

    container.innerHTML =
      huelle('pcAum', 'Portfoliowert',
        'Wert aller Immobilien zum Jahresende, aufgeteilt in Eigen- und Fremdkapital' + prognoseHinweis,
        legende([{ c: S1, t: 'Eigenkapital' }, { c: S2, t: 'Fremdkapital' }])) +
      huelle('pcCf', 'Cashflow je Jahr',
        'Mieteinnahmen gegen Hausgeld und Bankrate · Linie ist der Cashflow' + prognoseHinweis,
        legende([{ c: S1, t: 'Miete' }, { c: S2, t: 'Hausgeld' }, { c: S3, t: 'Bankrate' }, { c: INK, t: 'Cashflow' }])) +
      huelle('pcTg', 'Fremdkapital & Tilgung',
        'Restschuld zum Jahresende (Linie, linke Achse) und Tilgung im Jahr (Balken, rechte Achse)' + prognoseHinweis,
        legende([{ c: S2, t: 'Restschuld' }, { c: S3, t: 'Tilgung im Jahr' }])) +
      huelle('pcRd', 'Mietrendite je Immobilie',
        'Jahreskaltmiete bezogen auf Kaufpreis bzw. festgelegten Wert · Stand heute',
        legende([{ c: S1, t: 'Mietrendite' }, { c: INK, t: 'Portfolioschnitt' }]))

    var aum = container.querySelector('#pcAum')
    var cf  = container.querySelector('#pcCf')
    var tg  = container.querySelector('#pcTg')
    var rd  = container.querySelector('#pcRd')

    zeichneAum(aum, daten)
    zeichneCf(cf, daten)
    zeichneTilgung(tg, daten)

    if (objekte.length) {
      zeichneRendite(rd, objekte)
      verdrahten(rd, objekte, [
        { t: 'Mietrendite', f: function (o) { return pct(o.rendite) } },
        { t: 'Jahresmiete', v: function (o) { return o.miete } },
        { t: 'Basis',       v: function (o) { return o.basis } }
      ], 'Immobilie', function (o) { return o.name })
    } else {
      rd.querySelector('.pc-plot').innerHTML = '<div class="pc-leer">Noch keine Immobilie mit Kaufpreis erfasst.</div>'
    }

    verdrahten(aum, daten, [
      { t: 'Eigenkapital', v: function (d) { return d.eigenkapital } },
      { t: 'Fremdkapital', v: function (d) { return d.fremdkapital } },
      { t: 'Gesamtwert',   v: function (d) { return d.wert } }])
    verdrahten(cf, daten, [
      { t: 'Miete',    v: function (d) { return d.miete } },
      { t: 'Hausgeld', v: function (d) { return d.hausgeld } },
      { t: 'Bankrate', v: function (d) { return d.bankrate } },
      { t: 'Cashflow', v: function (d) { return d.cf } }])
    verdrahten(tg, daten, [
      { t: 'Restschuld',      v: function (d) { return d.fremdkapital } },
      { t: 'Tilgung im Jahr', v: function (d) { return d.tilgung } }])
  }

  var letzteProps = null, resizeTimer = null
  window.IECharts = {
    render: function (container, props) {
      letzteProps = { c: container, p: props }
      aufbauen(container, props)
    },
  }
  window.addEventListener('resize', function () {
    if (!letzteProps) return
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(function () { aufbauen(letzteProps.c, letzteProps.p) }, 180)
  })
})()
