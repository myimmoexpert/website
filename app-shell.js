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

  var PROP_VIEWS = [
    { key: 'uberblick',   label: 'Überblick' },
    { key: 'liquiditaet', label: 'Liquidität' },
    { key: 'nebenkosten', label: 'Nebenkostenabrechnung' },
    { key: 'weitere', label: 'Weitere', children: [
      { key: 'checkliste', label: 'Checkliste Kauf' },
      { key: 'dateien',    label: 'Dateien' },
      { key: 'notes',      label: 'Notes' },
      { key: 'todos',      label: 'To-Dos' },
      { key: 'weg',        label: 'WEG-Versammlungen' }
    ]}
  ]

  var WEITERE_KEYS = ['checkliste', 'dateien', 'notes', 'todos', 'weg']

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
    // Mein Portfolio ist eine eigene Seite
    var mp = makeItem({
      label: 'Mein Portfolio',
      href: P.portfolio,
      active: !PROP && (VIEW === 'mein-portfolio' || currentFile() === P.portfolio)
    })
    mp.setAttribute('data-key', 'mein-portfolio')
    nav.appendChild(mp)

    ;[['liquiditaet', 'Liquidität'], ['aum', 'AUM Entwicklung'],
      ['todos', 'To-Dos'], ['notes', 'Notes']].forEach(function (v) {
      addSimple(nav, P.global, v[0], v[1])
    })

    nav.appendChild(el('div', 'ie-sb-sep', 'Immobilien'))
    var holder = el('div', 'ie-sb-props')
    holder.id = 'ieSbProps'
    holder.appendChild(el('div', 'ie-sb-empty', 'lädt …'))
    nav.appendChild(holder)

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
        .select('id, bezeichnung, objektart')
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

  function buildPropGroup (p) {
    var isOpen = (PROP === p.id)
    var group = el('div', 'ie-sb-group' + (isOpen ? ' open' : ''))
    var icon = OBJEKTART_ICONS[p.objektart] || '🏗️'

    var head = makeItem({
      label: p.bezeichnung || 'Immobilie',
      thumb: icon,
      chevron: true,
      onClick: function () { group.classList.toggle('open') }
    })
    group.appendChild(head)

    var sub = el('div', 'ie-sb-sub')
    PROP_VIEWS.forEach(function (v) {
      if (v.children) {
        var openW = isOpen && WEITERE_KEYS.indexOf(VIEW) !== -1
        var g2 = el('div', 'ie-sb-group' + (openW ? ' open' : ''))
        g2.appendChild(makeItem({
          label: v.label, sub: true, chevron: true,
          onClick: function () { g2.classList.toggle('open') }
        }))
        var sub2 = el('div', 'ie-sb-sub')
        v.children.forEach(function (c) { sub2.appendChild(propLink(p, c, isOpen)) })
        g2.appendChild(sub2)
        sub.appendChild(g2)
      } else {
        sub.appendChild(propLink(p, v, isOpen))
      }
    })
    group.appendChild(sub)
    return group
  }

  function propLink (p, v, isOpen) {
    var file = P.immobilie
    var active = isOpen && VIEW === v.key
    var n
    if (currentFile() === file && isOpen && typeof window.ieSetView === 'function') {
      n = makeItem({ label: v.label, sub: true, active: active, onClick: function (e) {
        e.preventDefault()
        window.ieSetView(v.key)
        history.replaceState(null, '', file + '?id=' + p.id + '&tab=' + v.key)
        setActive(v.key)
        closeMobile()
      }})
    } else {
      n = makeItem({
        label: v.label, sub: true, active: active,
        href: file + '?id=' + p.id + '&tab=' + v.key
      })
    }
    n.setAttribute('data-key', isOpen ? v.key : p.id + ':' + v.key)
    return n
  }

  /* ── Mobil ─────────────────────────────────────────────── */
  function closeMobile () { document.body.classList.remove('ie-sb-open') }

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

    if (AREA) {
      body.classList.add('has-sidebar')
      var sb = buildSidebar()
      top.insertAdjacentElement('afterend', sb)
      var scrim = el('div', 'ie-scrim')
      scrim.addEventListener('click', closeMobile)
      sb.insertAdjacentElement('afterend', scrim)
      sb.insertAdjacentElement('afterend', content)
    } else {
      top.insertAdjacentElement('afterend', content)
    }

    var burger = document.getElementById('ieBurger')
    if (burger) burger.addEventListener('click', function () {
      document.body.classList.toggle('ie-sb-open')
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
