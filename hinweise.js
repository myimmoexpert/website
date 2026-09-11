/* ══════════════════════════════════════════════════════════════
   Immo.Expert – Hinweise je Immobilie

   Eine gemeinsame Stelle für die Regeln, damit das Seitenmenü und
   die Immobilienseite denselben roten Punkt zeigen.

   Ein Hinweis wird ausgeblendet, wenn er als erledigt markiert wurde
   (gilt bis zur nächsten Änderung des zugrunde liegenden Datums) oder
   wenn er auf ein späteres Datum verschoben wurde.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict'

  // "01.07.2025", "2025-07-01" und "1.7.25" werden verstanden
  function parseDatum (s) {
    if (!s) return null
    const t = String(s).trim()
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    m = t.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/)
    if (m) {
      let j = Number(m[3])
      if (j < 100) j += 2000
      return new Date(j, Number(m[2]) - 1, Number(m[1]))
    }
    const d = new Date(t)
    return isNaN(d.getTime()) ? null : d
  }

  function heute () {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }

  function mvOf (prop) {
    const mv = prop && prop.mietverhaeltnis
    return (mv && (mv.aktuell || mv)) || {}
  }

  function hinweisStand (prop, key) {
    const mv = mvOf(prop)
    return (mv.hinweise && mv.hinweise[key]) || {}
  }

  /* Alle offenen Hinweise einer Immobilie */
  function sammeln (prop) {
    const out = []
    const mv = mvOf(prop)
    const jetzt = heute()

    // 1) Mieterhöhung: letzte Anpassung liegt mehr als 12 Monate zurück
    const basis = parseDatum(mv.letzteMieterhoehung)
    if (basis) {
      const faellig = new Date(basis)
      faellig.setMonth(faellig.getMonth() + 12)
      if (faellig <= jetzt) {
        const st = hinweisStand(prop, 'mieterhoehung')
        const erledigt = st.erledigtFuer && st.erledigtFuer === String(mv.letzteMieterhoehung)
        const schlummer = parseDatum(st.schlummertBis)
        if (!erledigt && (!schlummer || schlummer <= jetzt)) {
          const monate = Math.floor((jetzt - basis) / (1000 * 60 * 60 * 24 * 30.44))
          out.push({
            key: 'mieterhoehung',
            bereich: 'mietverhaeltnis',
            titel: 'Mieterhöhung prüfen',
            text: 'Die letzte Mieterhöhung war am ' + fmt(basis) + ' und liegt ' + monate + ' Monate zurück.',
            seit: faellig,
          })
        }
      }
    }

    return out
  }

  function fmt (d) {
    return d ? String(d.getDate()).padStart(2, '0') + '.' +
               String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear() : ''
  }

  /* Zustand setzen – gibt das veränderte mietverhaeltnis-Objekt zurück */
  function erledigen (mietObj, key) {
    const ziel = (mietObj.aktuell = mietObj.aktuell || {})
    ziel.hinweise = ziel.hinweise || {}
    ziel.hinweise[key] = { erledigtFuer: String(ziel.letzteMieterhoehung || ''), erledigtAm: fmt(heute()) }
    return mietObj
  }

  function verschieben (mietObj, key, monate) {
    const ziel = (mietObj.aktuell = mietObj.aktuell || {})
    ziel.hinweise = ziel.hinweise || {}
    const bis = heute()
    bis.setMonth(bis.getMonth() + Number(monate || 1))
    ziel.hinweise[key] = { schlummertBis: bis.toISOString().slice(0, 10) }
    return mietObj
  }

  window.IEHinweise = {
    sammeln: sammeln,
    erledigen: erledigen,
    verschieben: verschieben,
    parseDatum: parseDatum,
    fmt: fmt,
  }
})()
