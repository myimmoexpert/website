/* ══════════════════════════════════════════════════════════════
   Immo.Expert – Portfolio-Graphen (reines SVG, ohne Fremdbibliothek)

   Farbwahl geprüft mit dem Validator der dataviz-Vorgaben
   (hell, Fläche #ffffff): Helligkeitsband, Sättigung, Farbfehlsichtigkeit,
   Normalsicht und Kontrast alle bestanden.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict'

  var S1 = '#0e8fa8'   // Petrol   – Eigenkapital / Miete
  var S2 = '#eb6834'   // Orange   – Fremdkapital / Hausgeld
  var S3 = '#2a78d6'   // Blau     – Bankrate
  var INK = '#101a2b', INK2 = '#64748b', GRID = 'rgba(16,26,43,0.09)', SURF = '#ffffff'

  var ZURUECK = 6, VOR = 6

  function eur (n, cent) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR',
      minimumFractionDigits: cent ? 2 : 0, maximumFractionDigits: cent ? 2 : 0 }).format(n || 0)
  }
  function kurz (n) {
    var a = Math.abs(n)
    if (a >= 1000000) return (n / 1000000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Mio'
    if (a >= 1000)    return Math.round(n / 1000) + 'k'
    return String(Math.round(n))
  }
  function mLabel (m) {
    var t = m.split('-').map(Number)
    return new Date(t[0], t[1] - 1, 1).toLocaleDateString('de-DE', { month: 'short' }) + ' ' + String(t[0]).slice(2)
  }
  function esc (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

  function achsenTicks (min, max, n) {
    var span = max - min || 1
    var roh = span / n
    var mag = Math.pow(10, Math.floor(Math.log10(roh)))
    var schritt = [1, 2, 2.5, 5, 10].map(function (f) { return f * mag })
      .filter(function (v) { return v >= roh })[0] || 10 * mag
    var start = Math.floor(min / schritt) * schritt
    var out = []
    for (var v = start; v <= max + schritt * 0.001; v += schritt) out.push(v)
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

  function verdrahten (root, daten, spalten) {
    var btn = root.querySelector('.pc-tbl-btn')
    var tbl = root.querySelector('.pc-table')
    btn.addEventListener('click', function () {
      var zu = tbl.hasAttribute('hidden')
      if (zu) {
        tbl.innerHTML = '<table><thead><tr><th>Monat</th>' +
          spalten.map(function (c) { return '<th class="ta-r">' + esc(c.t) + '</th>' }).join('') +
          '</tr></thead><tbody>' + daten.map(function (d) {
            return '<tr><td>' + mLabel(d.monat) + '</td>' +
              spalten.map(function (c) { return '<td class="ta-r">' + eur(c.v(d)) + '</td>' }).join('') + '</tr>'
          }).join('') + '</tbody></table>'
        tbl.removeAttribute('hidden'); btn.textContent = 'Tabelle ausblenden'
      } else { tbl.setAttribute('hidden', ''); btn.textContent = 'Tabelle' }
    })
  }

  // ── Graph 1: Assets under Management ───────────────────────
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
    var jetzt = window.IECalc.jetztMonat()
    var ji = daten.findIndex(function (d) { return d.monat === jetzt })

    function flaeche (unten, oben) {
      var a = daten.map(function (d, i) { return (i ? 'L' : 'M') + x(i) + ',' + y(oben(d)) }).join(' ')
      var b = daten.slice().reverse().map(function (d, i) {
        var j = daten.length - 1 - i
        return 'L' + x(j) + ',' + y(unten(d))
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
      if (i % 2 !== 0 && i !== daten.length - 1) return ''
      return '<text x="' + x(i) + '" y="' + (H - 9) + '" text-anchor="middle" fill="' + INK2 + '" font-size="11">' + mLabel(d.monat) + '</text>'
    }).join('')

    var heute = ji >= 0
      ? '<line x1="' + x(ji) + '" y1="' + pt + '" x2="' + x(ji) + '" y2="' + (pt + ih) + '" stroke="' + INK2 + '" stroke-width="1" stroke-dasharray="3 3" opacity="0.55"/>'
      : ''

    var heuteWert = ji >= 0 ? daten[ji].wert : daten[daten.length - 1].wert

    plot.insertAdjacentHTML('afterbegin',
      '<svg class="pc-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="Entwicklung des Portfoliowertes">' +
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
      '<span class="pc-hero-lab">Portfoliowert heute</span></div>')

    hover(root, plot, daten, x, function (d) { return y(d.wert) }, function (d) {
      return '<b>' + mLabel(d.monat) + '</b>' +
        row(S1, 'Eigenkapital', eur(d.eigenkapital)) +
        row(S2, 'Fremdkapital', eur(d.fremdkapital)) +
        row(INK, 'Gesamtwert', eur(d.wert))
    })
  }

  // ── Graph 2: Cashflow des Gesamtportfolios ─────────────────
  function zeichneCf (root, daten) {
    var plot = root.querySelector('.pc-plot')
    var W = Math.max(plot.clientWidth || 640, 320), H = 268
    var pl = 62, pr = 14, pt = 14, pb = 30
    var iw = W - pl - pr, ih = H - pt - pb
    var oben = Math.max.apply(null, daten.map(function (d) { return d.miete })) || 0
    var unten = Math.min.apply(null, daten.map(function (d) { return -(Math.abs(d.hausgeld) + Math.abs(d.bankrate)) })) || 0
    var maxA = Math.max(oben, Math.abs(unten), 1) * 1.12
    var ticks = achsenTicks(-maxA, maxA, 4)
    var y = function (v) { return pt + ih / 2 - (v / maxA) * (ih / 2) }
    var band = iw / daten.length
    var bw = Math.min(band * 0.52, 30)
    var xm = function (i) { return pl + band * i + band / 2 }
    var jetzt = window.IECalc.jetztMonat()

    var gitter = ticks.map(function (t) {
      return '<line x1="' + pl + '" y1="' + y(t) + '" x2="' + (W - pr) + '" y2="' + y(t) + '" stroke="' + GRID + '" stroke-width="1"/>' +
             '<text x="' + (pl - 10) + '" y="' + (y(t) + 4) + '" text-anchor="end" fill="' + INK2 + '" font-size="11">' + kurz(t) + '</text>'
    }).join('')

    var null_ = '<line x1="' + pl + '" y1="' + y(0) + '" x2="' + (W - pr) + '" y2="' + y(0) + '" stroke="rgba(16,26,43,0.28)" stroke-width="1"/>'

    var balkenHtml = daten.map(function (d, i) {
      var x0 = xm(i) - bw / 2
      var hg = -Math.abs(d.hausgeld), br = -Math.abs(d.bankrate)
      return '<path d="' + balken(x0, bw, y(0), y(d.miete), 4) + '" fill="' + S1 + '"/>' +
             '<path d="' + balken(x0, bw, y(0), y(hg), 4) + '" fill="' + S2 + '"/>' +
             '<path d="' + balken(x0, bw, y(hg) + 2, y(hg + br), 4) + '" fill="' + S3 + '"/>'
    }).join('')

    var cfLinie = daten.map(function (d, i) { return (i ? 'L' : 'M') + xm(i) + ',' + y(d.cf) }).join('')
    var cfPunkte = daten.map(function (d, i) {
      return '<circle cx="' + xm(i) + '" cy="' + y(d.cf) + '" r="4.5" fill="' + SURF + '" stroke="' + INK + '" stroke-width="2"/>'
    }).join('')

    var xlab = daten.map(function (d, i) {
      if (i % 2 !== 0 && i !== daten.length - 1) return ''
      return '<text x="' + xm(i) + '" y="' + (H - 9) + '" text-anchor="middle" fill="' + INK2 + '" font-size="11">' + mLabel(d.monat) + '</text>'
    }).join('')

    var ji = daten.findIndex(function (d) { return d.monat === jetzt })
    var heute = ji >= 0
      ? '<rect x="' + (pl + band * ji) + '" y="' + pt + '" width="' + band + '" height="' + ih + '" fill="rgba(16,26,43,0.035)"/>'
      : ''

    plot.insertAdjacentHTML('afterbegin',
      '<svg class="pc-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="Cashflow des Gesamtportfolios">' +
        heute + gitter + null_ + balkenHtml +
        '<path d="' + cfLinie + '" fill="none" stroke="' + INK + '" stroke-width="2"/>' + cfPunkte + xlab +
        '<g class="pc-cross" opacity="0"><line y1="' + pt + '" y2="' + (pt + ih) + '" stroke="' + INK + '" stroke-width="1"/></g>' +
      '</svg>')

    hover(root, plot, daten, xm, function () { return null }, function (d) {
      return '<b>' + mLabel(d.monat) + '</b>' +
        row(S1, 'Miete', eur(d.miete)) +
        row(S2, 'Hausgeld', eur(d.hausgeld)) +
        row(S3, 'Bankrate', eur(d.bankrate)) +
        row(INK, 'Cashflow', eur(d.cf))
    })
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

  // ── Aufbau ─────────────────────────────────────────────────
  function aufbauen (container, props) {
    if (!container || !window.IECalc) return
    var monate = window.IECalc.fenster(ZURUECK, VOR)
    var daten = window.IECalc.reihe(props || [], monate)

    container.innerHTML =
      huelle('pcAum', 'Assets under Management',
        'Wert aller Immobilien, aufgeteilt in Eigen- und Fremdkapital · 6 Monate zurück bis 6 Monate voraus',
        legende([{ c: S1, t: 'Eigenkapital' }, { c: S2, t: 'Fremdkapital' }])) +
      huelle('pcCf', 'Cashflow Gesamtportfolio',
        'Mieteinnahmen gegen Hausgeld und Bankrate · Linie ist der Cashflow',
        legende([{ c: S1, t: 'Miete' }, { c: S2, t: 'Hausgeld' }, { c: S3, t: 'Bankrate' }, { c: INK, t: 'Cashflow' }]))

    var aum = container.querySelector('#pcAum')
    var cf  = container.querySelector('#pcCf')
    zeichneAum(aum, daten)
    zeichneCf(cf, daten)
    verdrahten(aum, daten, [
      { t: 'Eigenkapital', v: function (d) { return d.eigenkapital } },
      { t: 'Fremdkapital', v: function (d) { return d.fremdkapital } },
      { t: 'Gesamtwert',   v: function (d) { return d.wert } }])
    verdrahten(cf, daten, [
      { t: 'Miete',    v: function (d) { return d.miete } },
      { t: 'Hausgeld', v: function (d) { return d.hausgeld } },
      { t: 'Bankrate', v: function (d) { return d.bankrate } },
      { t: 'Cashflow', v: function (d) { return d.cf } }])
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
