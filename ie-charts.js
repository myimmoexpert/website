/* ══════════════════════════════════════════════════════════════
   Immo.Expert – Chart-Bausteine (reines SVG, ohne Fremdbibliothek)

   Drei Grundformen, die alle Seiten gemeinsam nutzen:
     IEChart.saeulen    – senkrechte Säulen (gruppiert oder gestapelt)
     IEChart.balken     – waagerechte Balken je Kategorie
     IEChart.wasserfall – von der Miete zum Cashflow

   Farben geprüft mit dem Palette-Validator der dataviz-Vorgaben
   (dunkle Fläche #18181b): Helligkeitsband, Sättigung,
   Farbfehlsichtigkeit, Normalsicht und Kontrast bestanden.
   Die Achse liegt immer vollständig innerhalb der Zeichenfläche –
   nichts ragt in die Überschrift.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict'

  var F = {
    GOLD:  '#b58c3c',
    BLAU:  '#3f7fe0',
    TERRA: '#d0604f',
    TEAL:  '#2f9f86',
    INK:   '#f1eee7',
    INK2:  '#9b968c',
    GRID:  'rgba(255,255,255,0.09)',
    NULL:  'rgba(255,255,255,0.28)',
    SURF:  '#18181b'
  }

  function eur (n) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
  }
  function kurz (n) {
    var a = Math.abs(n)
    if (a >= 1000000) return (n / 1000000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Mio'
    if (a >= 10000)   return Math.round(n / 1000) + 'k'
    if (a >= 1000)    return (n / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + 'k'
    return String(Math.round(n))
  }
  function esc (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
  function kuerze (s, n) {
    s = String(s == null ? '' : s)
    return s.length > n ? s.slice(0, n - 1) + '…' : s
  }

  // Säule mit abgerundetem Datenende, am Nullpunkt verankert
  function saeule (x, w, y0, y1, r) {
    var h = Math.abs(y1 - y0)
    if (h < 0.5 || w < 0.5) return ''
    var rr = Math.min(r, h, w / 2)
    if (y1 < y0) {
      return 'M' + x + ',' + y0 + ' L' + x + ',' + (y1 + rr) + ' Q' + x + ',' + y1 + ' ' + (x + rr) + ',' + y1 +
             ' L' + (x + w - rr) + ',' + y1 + ' Q' + (x + w) + ',' + y1 + ' ' + (x + w) + ',' + (y1 + rr) +
             ' L' + (x + w) + ',' + y0 + ' Z'
    }
    return 'M' + x + ',' + y0 + ' L' + x + ',' + (y1 - rr) + ' Q' + x + ',' + y1 + ' ' + (x + rr) + ',' + y1 +
           ' L' + (x + w - rr) + ',' + y1 + ' Q' + (x + w) + ',' + y1 + ' ' + (x + w) + ',' + (y1 - rr) +
           ' L' + (x + w) + ',' + y0 + ' Z'
  }
  // Waagerechter Balken, am Nullpunkt verankert (nach rechts oder links)
  function balkenPfad (y, h, x0, x1, r) {
    var w = Math.abs(x1 - x0)
    if (w < 0.5 || h < 0.5) return ''
    var rr = Math.min(r, w, h / 2)
    if (x1 > x0) {
      return 'M' + x0 + ',' + y + ' L' + (x1 - rr) + ',' + y + ' Q' + x1 + ',' + y + ' ' + x1 + ',' + (y + rr) +
             ' L' + x1 + ',' + (y + h - rr) + ' Q' + x1 + ',' + (y + h) + ' ' + (x1 - rr) + ',' + (y + h) +
             ' L' + x0 + ',' + (y + h) + ' Z'
    }
    return 'M' + x0 + ',' + y + ' L' + (x1 + rr) + ',' + y + ' Q' + x1 + ',' + y + ' ' + x1 + ',' + (y + rr) +
           ' L' + x1 + ',' + (y + h - rr) + ' Q' + x1 + ',' + (y + h) + ' ' + (x1 + rr) + ',' + (y + h) +
           ' L' + x0 + ',' + (y + h) + ' Z'
  }

  // Achsenstriche, die den Wertebereich sicher einschließen
  function skala (min, max, n) {
    if (min > 0) min = 0
    if (max < 0) max = 0
    if (max === min) max = min + 1
    var roh = (max - min) / (n || 4)
    var mag = Math.pow(10, Math.floor(Math.log10(roh)))
    var schritt = [1, 2, 2.5, 5, 10].map(function (f) { return f * mag })
      .filter(function (v) { return v >= roh })[0] || 10 * mag
    var lo = Math.floor(min / schritt + 1e-9) * schritt
    var hi = Math.ceil(max / schritt - 1e-9) * schritt
    if (hi <= lo) hi = lo + schritt
    var ticks = []
    for (var v = lo; v <= hi + schritt * 0.001; v += schritt) ticks.push(Math.round(v * 1000) / 1000)
    return { lo: lo, hi: hi, ticks: ticks }
  }

  /* ── Karte (Rahmen um einen Chart) ───────────────────────── */
  function karte (o) {
    var info = o.info
      ? ' <span class="ie-info" tabindex="0" role="button" aria-label="Erklärung"><span class="ie-info-pop">' + esc(o.info) + '</span></span>'
      : ''
    var hero = o.hero
      ? '<div class="pc-hero"><span class="pc-hero-val' + (o.hero.klasse ? ' ' + o.hero.klasse : '') + '">' + esc(o.hero.wert) + '</span>' +
        '<span class="pc-hero-lab">' + esc(o.hero.label || '') + '</span></div>'
      : ''
    var leg = (o.legende && o.legende.length)
      ? '<div class="pc-legend">' + o.legende.map(function (l) {
          return '<span class="pc-leg"><i style="background:' + l.c + (l.linie ? ';height:2px;border-radius:1px' : '') + '"></i>' + esc(l.t) + '</span>'
        }).join('') + '</div>'
      : ''
    return '<div class="pc-card' + (o.klasse ? ' ' + o.klasse : '') + '"' + (o.id ? ' id="' + o.id + '"' : '') + '>' +
      '<div class="pc-head"><div class="pc-title">' + esc(o.titel) + info + '</div></div>' +
      hero +
      '<div class="pc-plot"><div class="pc-tip" hidden></div></div>' +
      leg +
      '</div>'
  }

  function zeile (c, t, v) {
    return '<span class="pc-tip-row"><i style="background:' + c + '"></i>' + esc(t) + '<b>' + esc(v) + '</b></span>'
  }

  function breite (plot) {
    var w = plot.clientWidth
    if (!w) {
      var karteEl = plot.closest('.pc-card')
      w = karteEl ? karteEl.clientWidth - 44 : 0
    }
    return Math.max(w || 560, 280)
  }

  // Kurzinfo an einer x-Position anzeigen
  function tipZeigen (plot, svg, html, xVb) {
    var tip = plot.querySelector('.pc-tip')
    if (!tip) return
    var r = svg.getBoundingClientRect()
    var vb = svg.viewBox.baseVal
    tip.innerHTML = html
    tip.hidden = false
    var px = xVb / vb.width * r.width
    var links = px + 14
    if (links + tip.offsetWidth > r.width - 6) links = px - tip.offsetWidth - 14
    tip.style.left = Math.max(6, links) + 'px'
  }
  function tipWeg (plot) {
    var tip = plot.querySelector('.pc-tip')
    if (tip) tip.hidden = true
  }

  function svgStart (W, H, label) {
    return '<svg class="pc-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="' + esc(label || 'Diagramm') + '">'
  }

  // Zeichnet einen Chart neu, sobald sich die Breite der Fläche ändert
  // (Spaltenraster, aufgeklappter Bereich, Fenstergröße)
  var beobachter = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(function (eintraege) {
        eintraege.forEach(function (e) {
          var plot = e.target
          var w = Math.round(plot.clientWidth)
          if (!plot.__ie || !w || Math.abs(w - (plot.__ie.w || 0)) < 3) return
          plot.__ie.fn(plot, plot.__ie.o)
        })
      })
    : null
  function merken (plot, fn, o) {
    var neu = !plot.__ie
    plot.__ie = { fn: fn, o: o, w: Math.round(plot.clientWidth) }
    if (neu && beobachter) beobachter.observe(plot)
  }

  function plotLeeren (plot) {
    plot.querySelectorAll('svg, .pc-leer').forEach(function (n) { n.remove() })
  }

  function leer (plot, text) {
    plotLeeren(plot)
    plot.insertAdjacentHTML('afterbegin', '<div class="pc-leer">' + esc(text) + '</div>')
  }

  /* ── Säulen ──────────────────────────────────────────────────
     o.labels      Beschriftung je Kategorie
     o.serien      [{ name, farbe, werte: [] }]
     o.gestapelt   true = übereinander, sonst nebeneinander
     o.linie       optional { name, farbe, werte } – Linie mit Punkten
     o.aktuell     Index der hervorgehobenen Kategorie (z. B. heute)
     o.blass       function(i) -> true für Prognose/Vergangenheit (heller)
     o.tipTitel    function(i) -> Überschrift der Kurzinfo
     o.tipExtra    function(i) -> [{c,t,v}] weitere Zeilen
     o.wertOben    true = Wert über der hervorgehobenen Säule
     o.hoehe       Höhe in px (Standard 250)
  ─────────────────────────────────────────────────────────── */
  function saeulen (plot, o) {
    merken(plot, saeulen, o)
    plotLeeren(plot)
    var n = o.labels.length
    if (!n) { leer(plot, o.leerText || 'Noch keine Daten.'); return }
    var W = breite(plot), H = o.hoehe || 250
    var pl = 52, pr = 10, pt = o.wertOben ? 24 : 12, pb = 28
    var iw = W - pl - pr, ih = H - pt - pb
    var serien = o.serien || []
    var gest = !!o.gestapelt

    // Wertebereich
    var min = 0, max = 0
    for (var i = 0; i < n; i++) {
      if (gest) {
        var pos = 0, neg = 0
        serien.forEach(function (s) { var v = Number(s.werte[i]) || 0; if (v >= 0) pos += v; else neg += v })
        max = Math.max(max, pos); min = Math.min(min, neg)
      } else {
        serien.forEach(function (s) { var v = Number(s.werte[i]) || 0; max = Math.max(max, v); min = Math.min(min, v) })
      }
      if (o.linie) { var lv = Number(o.linie.werte[i]) || 0; max = Math.max(max, lv); min = Math.min(min, lv) }
    }
    var sk = skala(min, max, 4)
    var y = function (v) { return pt + ih - (v - sk.lo) / (sk.hi - sk.lo) * ih }
    var band = iw / n
    var gruppe = Math.min(band * (n > 16 ? 0.72 : 0.62), gest ? 46 : 22 * serien.length + 10)
    var xm = function (k) { return pl + band * k + band / 2 }
    var aktuell = (o.aktuell === undefined || o.aktuell === null) ? -1 : o.aktuell

    var html = svgStart(W, H, o.aria)
    // Hervorhebung der aktuellen Kategorie
    if (aktuell >= 0 && aktuell < n) {
      html += '<rect x="' + (pl + band * aktuell) + '" y="' + pt + '" width="' + band + '" height="' + ih + '" fill="rgba(255,255,255,0.045)" rx="4"/>'
    }
    sk.ticks.forEach(function (t) {
      html += '<line x1="' + pl + '" y1="' + y(t) + '" x2="' + (W - pr) + '" y2="' + y(t) + '" stroke="' + (t === 0 ? F.NULL : F.GRID) + '" stroke-width="1"/>' +
              '<text x="' + (pl - 8) + '" y="' + (y(t) + 4) + '" text-anchor="end" fill="' + F.INK2 + '" font-size="11">' + kurz(t) + '</text>'
    })

    for (var k = 0; k < n; k++) {
      var op = (o.blass && o.blass(k)) ? ' opacity="0.45"' : ''
      if (gest) {
        var obenStand = 0, untenStand = 0
        var x0 = xm(k) - gruppe / 2
        var sichtbar = serien.map(function (s) { return Number(s.werte[k]) || 0 })
        // oberste positive / unterste negative Serie bekommt die runde Kante
        var letztePos = -1, letzteNeg = -1
        sichtbar.forEach(function (v, si) { if (v > 0) letztePos = si; if (v < 0) letzteNeg = si })
        serien.forEach(function (s, si) {
          var v = sichtbar[si]
          if (!v) return
          var a, b
          if (v > 0) { a = obenStand; b = obenStand + v; obenStand = b }
          else { a = untenStand; b = untenStand + v; untenStand = b }
          var ya = y(a), yb = y(b)
          // 2 px Abstand zwischen gestapelten Segmenten
          if (a !== 0) ya += v > 0 ? -1 : 1
          if (Math.abs(yb - ya) < 1) return
          var rund = (v > 0 && si === letztePos) || (v < 0 && si === letzteNeg) ? 4 : 0
          html += '<path d="' + saeule(x0, gruppe, ya, yb, rund) + '" fill="' + s.farbe + '"' + op + '/>'
        })
      } else {
        var bw = (gruppe - 2 * (serien.length - 1)) / serien.length
        serien.forEach(function (s, si) {
          var v = Number(s.werte[k]) || 0
          var xx = xm(k) - gruppe / 2 + si * (bw + 2)
          var farbe = (s.farbeNeg && v < 0) ? s.farbeNeg : s.farbe
          html += '<path d="' + saeule(xx, bw, y(0), y(v), 4) + '" fill="' + farbe + '"' + op + '/>'
        })
      }
    }

    if (o.linie) {
      var d = o.linie.werte.map(function (v, k2) { return (k2 ? 'L' : 'M') + xm(k2) + ',' + y(Number(v) || 0) }).join(' ')
      html += '<path d="' + d + '" fill="none" stroke="' + o.linie.farbe + '" stroke-width="2"/>'
      o.linie.werte.forEach(function (v, k2) {
        html += '<circle cx="' + xm(k2) + '" cy="' + y(Number(v) || 0) + '" r="4" fill="' + F.SURF + '" stroke="' + o.linie.farbe + '" stroke-width="2"/>'
      })
    }

    if (o.wertOben && aktuell >= 0 && aktuell < n) {
      var summe = 0
      serien.forEach(function (s) { summe += Math.max(0, Number(s.werte[aktuell]) || 0) })
      html += '<text x="' + xm(aktuell) + '" y="' + (y(summe) - 7) + '" text-anchor="middle" fill="' + F.INK + '" font-size="11" font-weight="600">' + kurz(summe) + '</text>'
    }

    // x-Beschriftung, bei vielen Kategorien nur jede n-te
    var jede = Math.max(1, Math.ceil(n / Math.max(4, Math.floor(iw / 58))))
    o.labels.forEach(function (l, k3) {
      if (k3 % jede !== 0 && k3 !== aktuell) return
      if (k3 !== aktuell && aktuell >= 0 && Math.abs(k3 - aktuell) < jede && k3 % jede === 0 && jede > 1) return
      html += '<text x="' + xm(k3) + '" y="' + (H - 9) + '" text-anchor="middle" fill="' + (k3 === aktuell ? F.INK : F.INK2) + '" font-size="11"' + (k3 === aktuell ? ' font-weight="600"' : '') + '>' + esc(l) + '</text>'
    })

    html += '<rect class="pc-hl" x="0" y="' + pt + '" width="' + band + '" height="' + ih + '" fill="rgba(255,255,255,0.06)" rx="4" opacity="0"/>'
    html += '</svg>'
    plot.insertAdjacentHTML('afterbegin', html)

    var svg = plot.querySelector('svg')
    var hl = svg.querySelector('.pc-hl')
    var fmt = o.format || eur
    function zeigen (e) {
      var r = svg.getBoundingClientRect()
      var px = (e.clientX - r.left) / r.width * W
      var k4 = Math.floor((px - pl) / band)
      if (k4 < 0 || k4 >= n) { hl.setAttribute('opacity', '0'); tipWeg(plot); return }
      hl.setAttribute('x', pl + band * k4)
      hl.setAttribute('opacity', '1')
      var t = '<b>' + esc(o.tipTitel ? o.tipTitel(k4) : o.labels[k4]) + '</b>'
      serien.forEach(function (s) { t += zeile(s.farbe, s.name, fmt(Number(s.werte[k4]) || 0)) })
      if (o.linie) t += zeile(o.linie.farbe, o.linie.name, fmt(Number(o.linie.werte[k4]) || 0))
      if (o.tipExtra) o.tipExtra(k4).forEach(function (z) { t += zeile(z.c, z.t, z.v) })
      tipZeigen(plot, svg, t, xm(k4))
    }
    plot.onmousemove = zeigen
    plot.onmouseleave = function () { hl.setAttribute('opacity', '0'); tipWeg(plot) }
  }

  /* ── Waagerechte Balken ──────────────────────────────────────
     o.labels, o.serien [{name, farbe, werte}], o.gestapelt
     o.format     Werteformat (Kurzinfo und rechte Spalte)
     o.rechts     function(i) -> Text in der rechten Spalte
     o.referenz   { wert, name } – gestrichelte Linie (z. B. Schnitt)
  ─────────────────────────────────────────────────────────── */
  function balken (plot, o) {
    merken(plot, balken, o)
    plotLeeren(plot)
    var n = o.labels.length
    if (!n) { leer(plot, o.leerText || 'Noch keine Daten.'); return }
    var serien = o.serien || []
    var gest = !!o.gestapelt
    var W = breite(plot)
    var proZeile = gest || serien.length === 1 ? 34 : 18 * serien.length + 14
    var pt = 8, pb = 26
    var pl = Math.min(170, Math.max(96, W * 0.26)), pr = o.rechts ? 86 : 14
    var H = n * proZeile + pt + pb
    var iw = W - pl - pr

    var min = 0, max = 0
    for (var i = 0; i < n; i++) {
      if (gest) {
        var p = 0, q = 0
        serien.forEach(function (s) { var v = Number(s.werte[i]) || 0; if (v >= 0) p += v; else q += v })
        max = Math.max(max, p); min = Math.min(min, q)
      } else {
        serien.forEach(function (s) { var v = Number(s.werte[i]) || 0; max = Math.max(max, v); min = Math.min(min, v) })
      }
    }
    if (o.referenz) { max = Math.max(max, o.referenz.wert); min = Math.min(min, o.referenz.wert) }
    var sk = skala(min, max, 4)
    var x = function (v) { return pl + (v - sk.lo) / (sk.hi - sk.lo) * iw }
    var fmt = o.format || eur
    var tfmt = o.achse || kurz

    var html = svgStart(W, H, o.aria)
    sk.ticks.forEach(function (t) {
      html += '<line x1="' + x(t) + '" y1="' + pt + '" x2="' + x(t) + '" y2="' + (H - pb) + '" stroke="' + (t === 0 ? F.NULL : F.GRID) + '" stroke-width="1"/>' +
              '<text x="' + x(t) + '" y="' + (H - 8) + '" text-anchor="middle" fill="' + F.INK2 + '" font-size="11">' + esc(tfmt(t)) + '</text>'
    })

    for (var k = 0; k < n; k++) {
      var y0 = pt + k * proZeile
      var innen = proZeile - 12
      if (gest) {
        var a = 0, b = 0
        var werte = serien.map(function (s) { return Number(s.werte[k]) || 0 })
        var lp = -1
        werte.forEach(function (v, si) { if (v > 0) lp = si })
        serien.forEach(function (s, si) {
          var v = werte[si]
          if (v <= 0) return
          var xa = x(a) + (a ? 1 : 0), xb = x(a + v)
          a += v
          html += '<path d="' + balkenPfad(y0 + 6, innen, xa, xb, si === lp ? 4 : 0) + '" fill="' + s.farbe + '"/>'
        })
        serien.forEach(function (s, si) {
          var v = werte[si]
          if (v >= 0) return
          html += '<path d="' + balkenPfad(y0 + 6, innen, x(b), x(b + v), 4) + '" fill="' + s.farbe + '"/>'
          b += v
        })
      } else {
        var bh = (innen - 2 * (serien.length - 1)) / serien.length
        serien.forEach(function (s, si) {
          var v = Number(s.werte[k]) || 0
          html += '<path d="' + balkenPfad(y0 + 6 + si * (bh + 2), bh, x(0), x(v), 4) + '" fill="' + ((s.farbeNeg && v < 0) ? s.farbeNeg : s.farbe) + '"/>'
        })
      }
      html += '<text x="' + (pl - 10) + '" y="' + (y0 + proZeile / 2 + 4) + '" text-anchor="end" fill="' + F.INK + '" font-size="11.5">' + esc(kuerze(o.labels[k], Math.floor(pl / 7))) + '</text>'
      if (o.rechts) {
        html += '<text x="' + (W - 4) + '" y="' + (y0 + proZeile / 2 + 4) + '" text-anchor="end" fill="' + F.INK + '" font-size="11" font-weight="600">' + esc(o.rechts(k)) + '</text>'
      }
    }
    if (o.referenz && o.referenz.wert) {
      html += '<line x1="' + x(o.referenz.wert) + '" y1="' + pt + '" x2="' + x(o.referenz.wert) + '" y2="' + (H - pb) + '" stroke="' + F.INK + '" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.8"/>'
    }
    html += '<rect class="pc-hl" x="' + pl + '" y="0" width="' + iw + '" height="' + proZeile + '" fill="rgba(255,255,255,0.05)" rx="4" opacity="0"/>'
    html += '</svg>'
    plot.insertAdjacentHTML('afterbegin', html)

    var svg = plot.querySelector('svg')
    var hl = svg.querySelector('.pc-hl')
    plot.onmousemove = function (e) {
      var r = svg.getBoundingClientRect()
      var py = (e.clientY - r.top) / r.height * H
      var k2 = Math.floor((py - pt) / proZeile)
      if (k2 < 0 || k2 >= n) { hl.setAttribute('opacity', '0'); tipWeg(plot); return }
      hl.setAttribute('y', pt + k2 * proZeile)
      hl.setAttribute('opacity', '1')
      var t = '<b>' + esc(o.labels[k2]) + '</b>'
      serien.forEach(function (s) { t += zeile(s.farbe, s.name, fmt(Number(s.werte[k2]) || 0)) })
      if (o.tipExtra) o.tipExtra(k2).forEach(function (z) { t += zeile(z.c, z.t, z.v) })
      var tip = plot.querySelector('.pc-tip')
      tip.style.top = Math.max(4, (pt + k2 * proZeile + proZeile) / H * r.height + 4) + 'px'
      tipZeigen(plot, svg, t, (e.clientX - r.left) / r.width * W)
    }
    plot.onmouseleave = function () {
      hl.setAttribute('opacity', '0'); tipWeg(plot)
      var tip = plot.querySelector('.pc-tip'); if (tip) tip.style.top = ''
    }
  }

  /* ── Wasserfall ──────────────────────────────────────────────
     o.schritte  [{ name, wert, farbe, summe }]
                 summe:true zeichnet vom Nullpunkt bis zum laufenden Stand
  ─────────────────────────────────────────────────────────── */
  function wasserfall (plot, o) {
    merken(plot, wasserfall, o)
    plotLeeren(plot)
    var s = (o.schritte || []).filter(function (x) { return x.summe || Math.abs(Number(x.wert) || 0) > 0.004 })
    if (!s.length) { leer(plot, o.leerText || 'Noch keine Daten.'); return }
    var W = breite(plot), H = o.hoehe || 250
    var pl = 52, pr = 10, pt = 22, pb = 30
    var iw = W - pl - pr, ih = H - pt - pb
    var fmt = o.format || eur

    var stand = 0, stufen = []
    s.forEach(function (x) {
      var v = Number(x.wert) || 0
      if (x.summe) { stufen.push({ a: 0, b: stand, v: stand, x: x }) }
      else { stufen.push({ a: stand, b: stand + v, v: v, x: x }); stand += v }
    })
    var min = 0, max = 0
    stufen.forEach(function (st) { min = Math.min(min, st.a, st.b); max = Math.max(max, st.a, st.b) })
    var sk = skala(min, max, 4)
    var y = function (v) { return pt + ih - (v - sk.lo) / (sk.hi - sk.lo) * ih }
    var band = iw / stufen.length
    var bw = Math.min(band * 0.58, 58)
    var xm = function (k) { return pl + band * k + band / 2 }

    var html = svgStart(W, H, o.aria)
    sk.ticks.forEach(function (t) {
      html += '<line x1="' + pl + '" y1="' + y(t) + '" x2="' + (W - pr) + '" y2="' + y(t) + '" stroke="' + (t === 0 ? F.NULL : F.GRID) + '" stroke-width="1"/>' +
              '<text x="' + (pl - 8) + '" y="' + (y(t) + 4) + '" text-anchor="end" fill="' + F.INK2 + '" font-size="11">' + kurz(t) + '</text>'
    })
    stufen.forEach(function (st, k) {
      var farbe = st.x.farbe || (st.v < 0 ? F.TERRA : F.GOLD)
      html += '<path d="' + saeule(xm(k) - bw / 2, bw, y(st.a), y(st.b), 4) + '" fill="' + farbe + '"/>'
      // Verbinder zum nächsten Schritt
      if (k < stufen.length - 1) {
        html += '<line x1="' + (xm(k) + bw / 2) + '" y1="' + y(st.b) + '" x2="' + (xm(k + 1) - bw / 2) + '" y2="' + y(st.b) + '" stroke="' + F.INK2 + '" stroke-width="1" stroke-dasharray="3 3" opacity="0.7"/>'
      }
      var oben = Math.min(y(st.a), y(st.b))
      var unten = Math.max(y(st.a), y(st.b))
      var ly = st.v >= 0 ? oben - 6 : unten + 13
      if (ly > pt + ih - 2) ly = oben - 6
      html += '<text x="' + xm(k) + '" y="' + ly + '" text-anchor="middle" fill="' + F.INK + '" font-size="11" font-weight="600">' + kurz(st.v) + '</text>'
      html += '<text x="' + xm(k) + '" y="' + (H - 10) + '" text-anchor="middle" fill="' + (st.x.summe ? F.INK : F.INK2) + '" font-size="11"' + (st.x.summe ? ' font-weight="600"' : '') + '>' + esc(kuerze(st.x.name, Math.max(6, Math.floor(band / 6.4)))) + '</text>'
    })
    html += '<rect class="pc-hl" x="0" y="' + pt + '" width="' + band + '" height="' + ih + '" fill="rgba(255,255,255,0.06)" rx="4" opacity="0"/>'
    html += '</svg>'
    plot.insertAdjacentHTML('afterbegin', html)

    var svg = plot.querySelector('svg')
    var hl = svg.querySelector('.pc-hl')
    plot.onmousemove = function (e) {
      var r = svg.getBoundingClientRect()
      var px = (e.clientX - r.left) / r.width * W
      var k = Math.floor((px - pl) / band)
      if (k < 0 || k >= stufen.length) { hl.setAttribute('opacity', '0'); tipWeg(plot); return }
      hl.setAttribute('x', pl + band * k)
      hl.setAttribute('opacity', '1')
      var st = stufen[k]
      var t = '<b>' + esc(st.x.name) + '</b>' + zeile(st.x.farbe || (st.v < 0 ? F.TERRA : F.GOLD), st.x.summe ? 'Ergebnis' : 'Betrag', fmt(st.v))
      if (st.x.hinweis) t += '<span class="pc-tip-row">' + esc(st.x.hinweis) + '</span>'
      tipZeigen(plot, svg, t, xm(k))
    }
    plot.onmouseleave = function () { hl.setAttribute('opacity', '0'); tipWeg(plot) }
  }

  window.IEChart = {
    farben: F, eur: eur, kurz: kurz, esc: esc,
    karte: karte, saeulen: saeulen, balken: balken, wasserfall: wasserfall, leer: leer
  }
})()
