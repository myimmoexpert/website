/* ══════════════════════════════════════════════════════════════
   Immo.Expert – App-Shell
   Baut die obere Leiste und das linke Navigationsmenü und schiebt
   den vorhandenen Seiteninhalt in den Inhaltsbereich.

   Aufruf: vor dem Einbinden dieser Datei
     <script>window.IE_PAGE = { area:'portfolio', view:'liquiditaet' }</script>
   Optional: propId (UUID der Immobilie), wenn eine Immobilie offen ist.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict'

  var SUPABASE_URL = 'https://awvnfocepqkkncgqgaka.supabase.co'
  var SUPABASE_KEY = 'sb_publishable_58JgPRNH2JIpXyTi-UZFOw_xohwzWZs'

  var PAGE = window.IE_PAGE || {}
  var AREA = PAGE.area || null          // 'finder' | 'portfolio' | 'profil' | null
  var VIEW = PAGE.view || null
  var PROP = PAGE.propId || null

  /* ── iPhone: kein automatisches Hineinzoomen in Eingabefelder ──
     Safari auf iOS zoomt bei jedem Feld mit weniger als 16 px Schrift
     hinein. maximum-scale verhindert das; Zoomen mit zwei Fingern bleibt
     auf iOS trotzdem möglich. Auf Android würde es das Zoomen sperren,
     deshalb nur auf iOS. */
  ;(function () {
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    if (!ios) return
    var m = document.querySelector('meta[name="viewport"]')
    if (m && !/maximum-scale/.test(m.content)) m.content += ', maximum-scale=1'
  })()

  /* ── Erklärungen hinter dem kleinen i ─────────────────────
     Maus: beim Überfahren. Finger: Antippen öffnet, erneutes Antippen
     oder ein Tippen daneben schließt. Die Erklärung wird als schwebende
     Kopie am Bildschirmrand ausgerichtet, damit sie nie abgeschnitten ist. */
  ;(function () {
    var float = null, aktiv = null, schliessTimer = null, perTipp = false

    function box () {
      if (float) return float
      float = document.createElement('div')
      float.id = 'ieInfoFloat'
      float.setAttribute('role', 'tooltip')
      float.addEventListener('mouseenter', function () { clearTimeout(schliessTimer) })
      float.addEventListener('mouseleave', function () { if (!perTipp) spaeterZu() })
      document.body.appendChild(float)
      return float
    }

    function platzieren () {
      if (!aktiv || !float) return
      var r = aktiv.getBoundingClientRect()
      var vw = document.documentElement.clientWidth, vh = window.innerHeight
      var w = float.offsetWidth, h = float.offsetHeight
      var x = r.left + r.width / 2 - w / 2
      x = Math.max(12, Math.min(x, vw - w - 12))
      var y = r.bottom + 8
      if (y + h > vh - 12 && r.top - h - 8 > 12) y = r.top - h - 8
      float.style.left = Math.round(x) + 'px'
      float.style.top = Math.round(y) + 'px'
    }

    function auf (info, tipp) {
      var pop = info.querySelector('.ie-info-pop')
      if (!pop) return
      clearTimeout(schliessTimer)
      if (aktiv && aktiv !== info) aktiv.classList.remove('offen')
      aktiv = info
      perTipp = !!tipp
      info.classList.add('offen')
      var f = box()
      f.innerHTML = pop.innerHTML
      f.classList.add('offen')
      platzieren()
    }

    function zu () {
      clearTimeout(schliessTimer)
      if (aktiv) aktiv.classList.remove('offen')
      aktiv = null
      perTipp = false
      if (float) float.classList.remove('offen')
    }
    function spaeterZu () { clearTimeout(schliessTimer); schliessTimer = setTimeout(zu, 160) }

    var istTouch = false
    document.addEventListener('touchstart', function () { istTouch = true }, { passive: true, capture: true })

    document.addEventListener('mouseover', function (e) {
      if (istTouch) return
      var info = e.target.closest && e.target.closest('.ie-info')
      if (info) auf(info, false)
    })
    document.addEventListener('mouseout', function (e) {
      if (istTouch || perTipp) return
      var info = e.target.closest && e.target.closest('.ie-info')
      if (info && !info.contains(e.relatedTarget)) spaeterZu()
    })
    document.addEventListener('click', function (e) {
      var info = e.target.closest && e.target.closest('.ie-info')
      if (info) {
        // nicht das Aufklappen einer Kopfzeile o. Ä. auslösen
        e.preventDefault(); e.stopPropagation()
        if (aktiv === info && perTipp) zu(); else auf(info, true)
        return
      }
      if (float && float.contains(e.target)) return
      if (aktiv) zu()
    }, true)
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') zu()
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('ie-info')) {
        e.preventDefault(); auf(e.target, true)
      }
    })
    document.addEventListener('focusin', function (e) {
      if (!istTouch && e.target.classList && e.target.classList.contains('ie-info')) auf(e.target, false)
    })
    window.addEventListener('scroll', function () { if (aktiv) platzieren() }, true)
    window.addEventListener('resize', zu)
  })()

  /* Eingebettete Ansicht (z. B. Liquiditätsplanung einer Immobilie im
     Portfoliobereich): keine Leiste, kein Menü – nur der Inhalt. */
  if (PAGE.embed) {
    document.documentElement.classList.add('ie-embed')
    return
  }

  var P = {
    finder:    'finder.html',
    portfolio: 'portfolio.html',
    global:    'portfolio-uebersicht.html',
    immobilie: 'immobilie.html',
    profil:    'profil.html',
    index:     'index.html',
    login:     'login.html'
  }

  var OBJEKTART_ICONS = {
    'Eigentumswohnung': '🏢',
    'Einfamilienhaus':  '🏠',
    'Mehrfamilienhaus': '🏘️',
    'Gewerbe':          '🏪',
    'Sonstiges':        '🏗️'
  }

  /* Die Immobilienseite zeigt alle Bereiche untereinander auf einer Seite;
     das Menü verlinkt deshalb nur noch die Immobilie selbst. */

  function el (tag, cls, html) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (html != null) n.innerHTML = html
    return n
  }
  function esc (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
  function currentFile () {
    var p = window.location.pathname.split('/').pop()
    return p || 'index.html'
  }

  /* ── obere Leiste ──────────────────────────────────────── */
  function buildTopbar () {
    var bar = el('header', 'ie-topbar')
    bar.innerHTML =
      '<button class="ie-burger" id="ieBurger" aria-label="Menü">☰</button>' +
      '<a class="ie-logo" href="' + P.index + '">Immo<span>.Expert</span></a>' +
      '<div class="ie-spacer"></div>' +
      '<nav class="ie-topnav"><ul>' +
        '<li><a href="' + P.finder + '"' + (AREA === 'finder' ? ' class="active"' : '') + '>Immo.Finder</a></li>' +
        '<li><a href="' + P.portfolio + '"' + (AREA === 'portfolio' ? ' class="active"' : '') + '>Immo.Portfolio</a></li>' +
        '<li><a href="' + P.profil + '" class="ie-cta' + (AREA === 'profil' ? ' active' : '') + '" id="navAuthLink">Profil</a></li>' +
      '</ul></nav>'
    return bar
  }

  /* ── Menüeintrag ───────────────────────────────────────── */
  function makeItem (opts) {
    // opts: { label, href, active, sub, icon, thumb, onClick, chevron }
    var tag = opts.onClick ? 'button' : 'a'
    var n = document.createElement(tag)
    n.className = 'ie-sb-item' + (opts.active ? ' active' : '')
    if (tag === 'a') n.href = opts.href || '#'
    else n.type = 'button'

    var inner = ''
    if (opts.thumb) inner += '<span class="ie-sb-thumb">' + opts.thumb + '</span>'
    else if (!opts.sub) inner += '<span class="ie-dot"></span>'
    inner += '<span class="ie-lbl">' + esc(opts.label) + '</span>'
    if (opts.chevron) inner += '<span class="ie-chev">›</span>'
    n.innerHTML = inner

    if (opts.onClick) n.addEventListener('click', opts.onClick)
    return n
  }

  /* Navigiert entweder in der Seite (gleiche Datei) oder per Link */
  function viewTarget (file, key, extra) {
    var q = '?tab=' + encodeURIComponent(key) + (extra || '')
    if (currentFile() === file && typeof window.ieSetView === 'function') {
      return { onClick: function (e) {
        e.preventDefault()
        window.ieSetView(key)
        history.replaceState(null, '', file + q)
        setActive(key)
        closeMobile()
      } }
    }
    return { href: file + q }
  }

  function setActive (key) {
    var nav = document.getElementById('ieSbNav')
    if (!nav) return
    nav.querySelectorAll('.ie-sb-item').forEach(function (n) {
      n.classList.toggle('active', n.getAttribute('data-key') === key)
    })
  }

  /* ── Sidebar-Inhalt je Bereich ─────────────────────────── */
  function buildSidebar () {
    var aside = el('aside', 'ie-sidebar')
    aside.id = 'ieSidebar'
    aside.appendChild(buildMobilBereiche())
    if (!AREA) {
      // Seite ohne eigenes Menü: am Handy trotzdem die Hauptbereiche anbieten
      aside.className += ' ie-nur-mobil'
      return aside
    }
    var title = AREA === 'finder' ? 'Immo.Finder' : AREA === 'profil' ? 'Profil' : 'Immo.Portfolio'
    aside.appendChild(el('div', 'ie-sb-head', esc(title)))
    // bewusst ein <div>: seiteneigene nav-Regeln dürfen hier nicht greifen
    var nav = el('div', 'ie-sb-nav')
    nav.id = 'ieSbNav'
    aside.appendChild(nav)

    if (AREA === 'finder')    buildFinderMenu(nav)
    if (AREA === 'profil')    buildProfilMenu(nav)
    if (AREA === 'portfolio') buildPortfolioMenu(nav)

    return aside
  }

  /* Hauptbereiche für das Handy-Menü (oben in der Leiste ist dort kein Platz) */
  function buildMobilBereiche () {
    var box = el('div', 'ie-sb-mobil')
    ;[[P.index, 'Startseite', AREA === null && currentFile() === P.index],
      [P.finder, 'Immo.Finder', AREA === 'finder'],
      [P.portfolio, 'Immo.Portfolio', AREA === 'portfolio'],
      [P.profil, 'Profil', AREA === 'profil']].forEach(function (b) {
      var n = makeItem({ label: b[1], href: b[0], active: b[2] })
      if (b[0] === P.profil) n.id = 'ieSbAuthLink'
      box.appendChild(n)
    })
    return box
  }

  function addSimple (nav, file, key, label) {
    var t = viewTarget(file, key)
    var n = makeItem({ label: label, href: t.href, onClick: t.onClick, active: !PROP && VIEW === key })
    n.setAttribute('data-key', key)
    nav.appendChild(n)
  }

  function buildFinderMenu (nav) {
    addSimple(nav, P.finder, 'analyse', 'Inseratanalyse')
    addSimple(nav, P.finder, 'steckbriefe', 'Gespeicherte Steckbriefe')
  }

  function buildProfilMenu (nav) {
    addSimple(nav, P.profil, 'profil', 'Mein Profil')
    addSimple(nav, P.profil, 'einstellungen', 'Einstellungen')
  }

  function buildPortfolioMenu (nav) {
    // Portfolioübersicht ist eine eigene Seite
    var mp = makeItem({
      label: 'Portfolioübersicht',
      href: P.portfolio,
      active: !PROP && (VIEW === 'mein-portfolio' || currentFile() === P.portfolio)
    })
    mp.setAttribute('data-key', 'mein-portfolio')
    nav.appendChild(mp)

    ;[['planung', 'Liquiditätsplanung'],
      ['szenario', 'Szenarienrechner'],
      ['jahr', 'Jahresübersicht'],
      ['notizen', 'Notizen']].forEach(function (v) {
      addSimple(nav, P.global, v[0], v[1])
    })

    nav.appendChild(el('div', 'ie-sb-sep', 'Immobilien'))
    var holder = el('div', 'ie-sb-props')
    holder.id = 'ieSbProps'
    holder.appendChild(el('div', 'ie-sb-empty', 'lädt …'))
    nav.appendChild(holder)

    // Direkt aus dem Menü eine Immobilie anlegen, ohne Umweg über die Übersicht
    var add = makeItem({ label: 'Immobilie hinzufügen', thumb: '+', href: P.portfolio + '?add=1' })
    add.className += ' ie-sb-add'
    add.setAttribute('data-key', 'immobilie-hinzufuegen')
    nav.appendChild(add)

    loadProperties(holder)
  }

  /* ── Immobilienliste ───────────────────────────────────── */
  function loadProperties (holder) {
    function fail (msg) { holder.innerHTML = '<div class="ie-sb-empty">' + msg + '</div>' }

    if (!window.supabase || !window.supabase.createClient) { fail('–'); return }
    var client = window.IE_SB || window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    window.IE_SB = client

    client.auth.getSession().then(function (r) {
      if (!r.data || !r.data.session) { fail('Bitte anmelden'); return }
      return client.from('portfolio')
        .select('id, bezeichnung, objektart, mietverhaeltnis')
        .order('created_at', { ascending: true })
        .then(function (res) {
          if (res.error) { fail('nicht ladbar'); return }
          var rows = res.data || []
          if (!rows.length) { fail('Noch keine Immobilie'); return }
          holder.innerHTML = ''
          rows.forEach(function (p) { holder.appendChild(buildPropGroup(p)) })
        })
    }).catch(function () { fail('–') })
  }

  /* Eine Immobilie = ein Menüeintrag = eine Seite */
  function buildPropGroup (p) {
    var n = makeItem({
      label: p.bezeichnung || 'Immobilie',
      thumb: OBJEKTART_ICONS[p.objektart] || '🏗️',
      href: P.immobilie + '?id=' + p.id,
      active: PROP === p.id
    })
    n.setAttribute('data-key', 'prop:' + p.id)

    // Roter Punkt, wenn in einem Bereich dieser Immobilie etwas offen ist
    var offen = (window.IEHinweise && window.IEHinweise.sammeln(p)) || []
    if (offen.length) {
      var punkt = el('span', 'ie-sb-alert')
      punkt.title = offen.map(function (h) { return h.titel }).join(' · ')
      n.appendChild(punkt)
    }
    return n
  }

  /* Von der Immobilienseite aufgerufen, wenn ein Hinweis erledigt wurde */
  window.IEShellRefreshAlerts = function (propId, offeneAnzahl) {
    var item = document.querySelector('.ie-sb-item[data-key="prop:' + propId + '"]')
    if (!item) return
    var punkt = item.querySelector('.ie-sb-alert')
    if (offeneAnzahl > 0 && !punkt) {
      item.appendChild(el('span', 'ie-sb-alert'))
    } else if (!offeneAnzahl && punkt) {
      punkt.remove()
    }
  }

  /* ── Mobil ─────────────────────────────────────────────── */
  function closeMobile () {
    document.body.classList.remove('ie-sb-open')
    var b = document.getElementById('ieBurger')
    if (b) { b.textContent = '☰'; b.setAttribute('aria-expanded', 'false') }
  }

  /* ── Aufbau ────────────────────────────────────────────── */
  function mount () {
    var body = document.body
    body.classList.add('ie-app')

    // vorhandene alte Navigation entfernen
    var oldNav = body.querySelector(':scope > nav')
    if (oldNav) oldNav.remove()

    // Inhalt einsammeln
    var content = el('div', 'ie-content')
    var keep = []
    Array.prototype.slice.call(body.childNodes).forEach(function (n) {
      if (n.nodeType === 1) {
        var t = n.tagName
        if (t === 'SCRIPT' || t === 'TEMPLATE' || n.id === 'authGuard') { keep.push(n); return }
      }
      content.appendChild(n)
    })

    var top = buildTopbar()
    body.insertBefore(top, body.firstChild)

    if (AREA) body.classList.add('has-sidebar')
    var sb = buildSidebar()
    top.insertAdjacentElement('afterend', sb)
    var scrim = el('div', 'ie-scrim')
    scrim.addEventListener('click', closeMobile)
    sb.insertAdjacentElement('afterend', scrim)
    sb.insertAdjacentElement('afterend', content)

    // Menü schließt sich, sobald ein Eintrag angetippt wird
    sb.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a.ie-sb-item')) closeMobile()
    })
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMobile() })

    var burger = document.getElementById('ieBurger')
    if (burger) burger.addEventListener('click', function () {
      var offen = document.body.classList.toggle('ie-sb-open')
      burger.textContent = offen ? '✕' : '☰'
      burger.setAttribute('aria-expanded', offen ? 'true' : 'false')
    })

    syncAuthLink()

    window.IEShell = {
      setActive: setActive,
      paths: P,
      icons: OBJEKTART_ICONS
    }
  }

  /* Profil ⇄ Login in der oberen Leiste */
  function syncAuthLink () {
    var link = document.getElementById('navAuthLink')
    if (!link || !window.supabase || !window.supabase.createClient) return
    var client = window.IE_SB || window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    window.IE_SB = client
    function apply (has) {
      link.href = has ? P.profil : P.login
      link.textContent = has ? 'Profil' : 'Login'
      var sbLink = document.getElementById('ieSbAuthLink')
      if (sbLink) {
        sbLink.href = has ? P.profil : P.login
        var l = sbLink.querySelector('.ie-lbl')
        if (l) l.textContent = has ? 'Profil' : 'Login'
      }
    }
    client.auth.getSession().then(function (r) { apply(!!(r.data && r.data.session)) })
    client.auth.onAuthStateChange(function (_e, s) { apply(!!s) })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount)
  } else {
    mount()
  }
})()
