/* ══════════════════════════════════════════════════════════════
   Immo.Expert – Benachrichtigungen

   Eine Stelle für alle Regeln: die Glocke in der oberen Leiste
   (notifications.js) und der Bereich „Benachrichtigungen" in der
   Portfolioübersicht benutzen dieselben Funktionen.

   Die Einstellungen liegen je Immobilie im JSON „einstellungen"
   unter „benachrichtigungen" – so bleibt die Tabelle unverändert.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict'

  var STANDARD = {
    mieterhoehung: true,            // 12 Monate nach der letzten Mieterhöhung
    nk: true,                       // Nebenkostenabrechnung erstellen
    nkStichtag: '06-30',            // Tag im Jahr, ab dem erinnert wird
    buchungen: { miete: true, weitereMiete: true, hausgeld: true, darlehen: true },
  }

  function einstellungen (p) {
    var e = (p && p.einstellungen && p.einstellungen.benachrichtigungen) || {}
    return {
      mieterhoehung: e.mieterhoehung !== undefined ? !!e.mieterhoehung : STANDARD.mieterhoehung,
      nk:            e.nk !== undefined ? !!e.nk : STANDARD.nk,
      nkStichtag:    /^\d{2}-\d{2}$/.test(e.nkStichtag || '') ? e.nkStichtag : STANDARD.nkStichtag,
      buchungen: {
        miete:        e.buchungen && e.buchungen.miete !== undefined ? !!e.buchungen.miete : true,
        weitereMiete: e.buchungen && e.buchungen.weitereMiete !== undefined ? !!e.buchungen.weitereMiete : true,
        hausgeld:     e.buchungen && e.buchungen.hausgeld !== undefined ? !!e.buchungen.hausgeld : true,
        darlehen:     e.buchungen && e.buchungen.darlehen !== undefined ? !!e.buchungen.darlehen : true,
      },
    }
  }

  /* ── Hilfsmittel ──────────────────────────────────────────── */
  function datumLesen (s) {
    if (!s) return null
    s = String(s).trim()
    var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/)
    if (m) {
      var y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
      var d = new Date(y, Number(m[2]) - 1, Number(m[1]))
      return isNaN(d.getTime()) ? null : d
    }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return null
  }
  function datumSchreiben (d) {
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  function monatName (m) {
    var t = String(m).split('-').map(Number)
    return new Date(t[0], t[1] - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
  }
  function monatPlus (m, n) {
    var t = String(m).split('-').map(Number)
    var i = t[0] * 12 + (t[1] - 1) + n
    return Math.floor(i / 12) + '-' + String(i % 12 + 1).padStart(2, '0')
  }
  function letzterVollerMonat () {
    var d = new Date()
    return monatPlus(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), -1)
  }

  /* Gilt eine Zeile in einem Monat als gebucht?
     Gebucht ist eine Zahl, die aus dem Kontoauszug stammt oder in der
     Tabelle von Hand mit dem grünen Haken bestätigt wurde. Alles andere
     ist Planung. */
  function zeileGebucht (lq, zeile, monat) {
    var ic = lq.importedCells || {}
    var marken = lq.marken || {}
    var k = zeile + '|' + monat
    return !!ic[k] || marken[k] === 'ok'
  }
  function artGebucht (lq, art, monat) {
    var bb = (lq.bankBuchungen || {})[monat] || {}
    var hand = (lq.gebucht || {})[monat] || {}
    if (art === 'miete') {
      return hand.miete === true || bb.miete !== undefined ||
        ['miete', 'nkm', 'nk'].some(function (z) { return zeileGebucht(lq, z, monat) })
    }
    if (art === 'weitereMiete') return zeileGebucht(lq, 'weitereMiete', monat)
    if (art === 'hausgeld') return hand.hausgeld === true || zeileGebucht(lq, 'hausgeld', monat)
    // Darlehen (beide Darlehen zusammen)
    return hand.bank === true || bb.bankrate !== undefined || bb.bankrate2 !== undefined ||
      ['bankrate', 'zins', 'tilgung', 'bankrate2', 'zins2', 'tilgung2']
        .some(function (z) { return zeileGebucht(lq, z, monat) })
  }

  // Ist die Nebenkostenabrechnung für ein Jahr schon in Arbeit?
  function nkErledigt (p, jahr) {
    var j = p && p.nebenkosten && p.nebenkosten.jahre && p.nebenkosten.jahre[jahr]
    if (!j) return false
    if (Array.isArray(j.dok) && j.dok.length) return true
    var hv = j.hv || {}
    return Object.keys(hv).some(function (k) { return hv[k] !== null && hv[k] !== undefined && hv[k] !== '' })
  }

  var ART_LABEL = {
    miete: 'Miete', weitereMiete: 'Weitere Mieteinnahmen',
    hausgeld: 'Hausgeld', darlehen: 'Darlehen',
  }

  /* ── Alle offenen Benachrichtigungen eines Portfolios ─────── */
  function sammeln (props, optionen) {
    var opt = optionen || {}
    var heute = new Date(); heute.setHours(0, 0, 0, 0)
    var C = window.IECalc
    var items = []

    ;(props || []).forEach(function (p) {
      var e = einstellungen(p)
      var name = p.bezeichnung || 'Immobilie'
      var lq = p.liquiditaet || {}

      // 1) Mieterhöhung liegt zwölf Monate zurück
      if (e.mieterhoehung) {
        var mv = (p.mietverhaeltnis && (p.mietverhaeltnis.aktuell || p.mietverhaeltnis)) || {}
        var basis = datumLesen(mv.letzteMieterhoehung)
        if (basis) {
          var faellig = new Date(basis)
          faellig.setMonth(faellig.getMonth() + 12)
          if (faellig <= heute) {
            items.push({
              typ: 'mieterhoehung', propId: p.id, titel: '📈 Mieterhöhung prüfen',
              sub: name + ' · letzte Erhöhung am ' + datumSchreiben(basis),
              datum: faellig, href: 'immobilie.html?id=' + p.id + '&tab=mietverhaeltnis',
            })
          }
        }
      }

      // 2) Nebenkostenabrechnung erstellen
      if (e.nk) {
        var teile = e.nkStichtag.split('-').map(Number)
        var stichtag = new Date(heute.getFullYear(), teile[0] - 1, teile[1])
        var jahr = heute.getFullYear() - 1
        if (heute >= stichtag && !nkErledigt(p, jahr)) {
          items.push({
            typ: 'nk', propId: p.id, titel: '🧾 Nebenkostenabrechnung ' + jahr + ' erstellen',
            sub: name + ' · fällig seit ' + datumSchreiben(stichtag),
            datum: stichtag, href: 'immobilie.html?id=' + p.id + '&tab=nebenkosten',
          })
        }
      }

      // 3) Abgelaufener Monat ohne alle erwarteten Buchungen
      if (C && lq.cells) {
        var monate = []
        for (var i = 0; i < (opt.monate || 3); i++) monate.push(monatPlus(letzterVollerMonat(), -i))
        monate.forEach(function (m) {
          if (C.uebernahme(p) > m) return
          var t = C.cfTeile(p, m)
          var erwartet = {
            miete: Math.abs(t.miete) > 0.004,
            weitereMiete: Math.abs(t.weitereMiete) > 0.004,
            hausgeld: Math.abs(t.hausgeld) > 0.004,
            darlehen: Math.abs(t.bankrate) > 0.004,
          }
          Object.keys(erwartet).forEach(function (art) {
            if (!erwartet[art] || !e.buchungen[art]) return
            if (artGebucht(lq, art, m)) return
            var ende = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)
            items.push({
              typ: 'buchung', propId: p.id, art: art,
              titel: '🏦 ' + ART_LABEL[art] + ' nicht gebucht',
              sub: name + ' · ' + monatName(m),
              datum: ende, href: 'portfolio-uebersicht.html?tab=planung',
            })
          })
        })
      }
    })

    items.sort(function (a, b) { return a.datum - b.datum })
    return items
  }

  window.IEBenachrichtigungen = {
    STANDARD: STANDARD,
    einstellungen: einstellungen,
    sammeln: sammeln,
    datumSchreiben: datumSchreiben,
    datumLesen: datumLesen,
    artLabel: ART_LABEL,
  }
})()
