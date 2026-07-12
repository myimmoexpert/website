// ═══════════════════════════════════════════════════════════
// Immo.Expert – Benachrichtigungen (Glocke in der Navigation)
// Wird auf allen Seiten eingebunden. Zeigt für eingeloggte
// Nutzer fällige To-Dos und Mieterhöhungs-Erinnerungen.
// Benachrichtigungen verschwinden automatisch, sobald sie
// erledigt sind (To-Do abgehakt / Datum aktualisiert / "Nein").
// ═══════════════════════════════════════════════════════════
(function () {
  if (!window.supabase) return
  const client = window.supabase.createClient(
    'https://awvnfocepqkkncgqgaka.supabase.co',
    'sb_publishable_58JgPRNH2JIpXyTi-UZFOw_xohwzWZs'
  )

  const style = document.createElement('style')
  style.textContent = `
    .notif-li { position: relative; display: flex; align-items: center; }
    .notif-bell { background: none; border: none; cursor: pointer; font-size: 1.1rem; position: relative; padding: 4px 6px; line-height: 1; filter: grayscale(1) brightness(1.4); transition: filter .2s; }
    .notif-bell:hover, .notif-bell.has-items { filter: none; }
    .notif-badge { position: absolute; top: -5px; right: -5px; background: #f87171; color: #fff; font-size: .62rem; font-weight: 700; min-width: 16px; height: 16px; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 0 4px; font-family: 'Inter', sans-serif; }
    .notif-panel { display: none; position: absolute; top: calc(100% + 14px); right: -10px; width: 340px; max-height: 440px; overflow-y: auto; background: #172540; border: 1px solid rgba(201,168,76,.25); border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.5); z-index: 500; font-family: 'Inter', sans-serif; }
    .notif-panel.open { display: block; }
    .notif-head { padding: 14px 18px; font-size: .76rem; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: #c9a84c; border-bottom: 1px solid rgba(255,255,255,.07); }
    .notif-item { display: block; padding: 13px 18px; border-bottom: 1px solid rgba(255,255,255,.05); text-decoration: none; transition: background .15s; }
    .notif-item:hover { background: rgba(255,255,255,.04); }
    .notif-item:last-child { border-bottom: none; }
    .notif-title { font-size: .85rem; font-weight: 600; color: #fff; margin-bottom: 3px; }
    .notif-sub { font-size: .76rem; color: #8a97aa; }
    .notif-sub .due { color: #f87171; font-weight: 600; }
    .notif-empty { padding: 26px 18px; text-align: center; color: #8a97aa; font-size: .84rem; }
    @media (max-width: 700px) { .notif-panel { right: -60px; width: min(320px, 92vw); } }
  `
  document.head.appendChild(style)

  // Datum aus Freitext lesen: TT.MM.JJJJ / TT.MM.JJ / JJJJ-MM-TT
  function parseDate(s) {
    if (!s) return null
    s = String(s).trim()
    let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/)
    if (m) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
      const d = new Date(y, Number(m[2]) - 1, Number(m[1]))
      return isNaN(d) ? null : d
    }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return null
  }
  const fmtD = d => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  async function collect() {
    const { data: s } = await client.auth.getSession()
    if (!s || !s.session) return null // nicht eingeloggt → keine Glocke
    const { data, error } = await client.from('portfolio').select('id, bezeichnung, todos, mietverhaeltnis')
    if (error) return []
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const items = []
    ;(data || []).forEach(p => {
      const name = p.bezeichnung || 'Immobilie'
      // 1) Fällige, offene To-Dos
      ;(Array.isArray(p.todos) ? p.todos : []).forEach(t => {
        if (t.done || !t.faellig) return
        const due = parseDate(t.faellig)
        if (due && due <= today) {
          items.push({ title: '✅ To-Do fällig: ' + t.text, sub: name, due, href: 'immobilie.html?id=' + p.id + '&tab=todos' })
        }
      })
      // 2) Mieterhöhungs-Erinnerung (12 Monate nach letzter Mieterhöhung)
      const mv = (p.mietverhaeltnis && (p.mietverhaeltnis.aktuell || p.mietverhaeltnis)) || {}
      if (String(mv.erinnerungMieterhoehung || '').toLowerCase() === 'ja') {
        const base = parseDate(mv.letzteMieterhoehung)
        if (base) {
          const due = new Date(base)
          due.setMonth(due.getMonth() + 12)
          if (due <= today) {
            items.push({ title: '📈 Mieterhöhung prüfen', sub: name + ' · letzte Erhöhung am ' + fmtD(base), due, href: 'immobilie.html?id=' + p.id + '&tab=mietverhaeltnis' })
          }
        }
      }
    })
    items.sort((a, b) => a.due - b.due)
    return items
  }

  function render(items) {
    const ul = document.querySelector('nav ul')
    if (!ul || !ul.lastElementChild) return
    const li = document.createElement('li')
    li.className = 'notif-li'
    li.innerHTML = `
      <button class="notif-bell${items.length ? ' has-items' : ''}" title="Benachrichtigungen" aria-label="Benachrichtigungen">🔔${items.length ? `<span class="notif-badge">${items.length}</span>` : ''}</button>
      <div class="notif-panel">
        <div class="notif-head">Benachrichtigungen</div>
        ${items.length
          ? items.map(i => `
              <a class="notif-item" href="${i.href}">
                <div class="notif-title">${esc(i.title)}</div>
                <div class="notif-sub">${esc(i.sub)} · <span class="due">fällig ${fmtD(i.due)}</span></div>
              </a>`).join('')
          : '<div class="notif-empty">🔕 Keine Benachrichtigungen</div>'}
      </div>`
    ul.insertBefore(li, ul.lastElementChild) // direkt vor Profil/Login
    const bell = li.querySelector('.notif-bell')
    const panel = li.querySelector('.notif-panel')
    bell.addEventListener('click', e => { e.stopPropagation(); panel.classList.toggle('open') })
    document.addEventListener('click', e => { if (!li.contains(e.target)) panel.classList.remove('open') })
  }

  collect().then(items => { if (items !== null) render(items) })
})()
