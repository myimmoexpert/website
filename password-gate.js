(function () {
  const PASS = 'ImmoexpertPR1'
  const KEY  = 'ie_gate'

  // Bereits entsperrt — Seite normal anzeigen
  if (sessionStorage.getItem(KEY) === '1') {
    document.documentElement.style.visibility = ''
    return
  }

  // Gate-CSS einfügen
  const style = document.createElement('style')
  style.textContent = `
    #ie-gate {
      position: fixed; inset: 0; z-index: 99999;
      background: #0f1c2e;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Inter', system-ui, sans-serif;
    }
    #ie-gate-box {
      background: #172540;
      border: 1px solid rgba(201,168,76,0.22);
      border-radius: 16px;
      padding: 48px 40px;
      width: 100%;
      max-width: 380px;
      text-align: center;
      box-shadow: 0 24px 60px rgba(0,0,0,0.4);
    }
    #ie-gate-logo {
      font-size: 1.6rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
    }
    #ie-gate-logo span { color: #c9a84c; }
    #ie-gate-sub {
      color: #8a97aa;
      font-size: 0.88rem;
      margin-bottom: 32px;
      line-height: 1.5;
    }
    #ie-gate-input {
      width: 100%;
      background: #0f1c2e;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      color: #ffffff;
      font-family: inherit;
      font-size: 1rem;
      padding: 14px 18px;
      outline: none;
      margin-bottom: 12px;
      text-align: center;
      letter-spacing: 2px;
      transition: border-color 0.2s;
    }
    #ie-gate-input::placeholder { letter-spacing: 0; color: #8a97aa; }
    #ie-gate-input:focus { border-color: rgba(201,168,76,0.5); }
    #ie-gate-btn {
      width: 100%;
      background: #c9a84c;
      color: #0f1c2e;
      border: none;
      border-radius: 10px;
      font-family: inherit;
      font-size: 0.95rem;
      font-weight: 700;
      padding: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }
    #ie-gate-btn:hover { background: #e0bf74; }
    #ie-gate-error {
      color: #f87171;
      font-size: 0.82rem;
      margin-top: 12px;
      min-height: 18px;
    }
  `
  document.head.appendChild(style)

  function buildGate() {
    const gate = document.createElement('div')
    gate.id = 'ie-gate'
    gate.innerHTML = `
      <div id="ie-gate-box">
        <div id="ie-gate-logo">Immo<span>.Expert</span></div>
        <div id="ie-gate-sub">Diese Seite ist passwortgeschützt.<br>Bitte Passwort eingeben.</div>
        <input id="ie-gate-input" type="password" placeholder="Passwort" autocomplete="current-password" />
        <button id="ie-gate-btn">Weiter →</button>
        <div id="ie-gate-error"></div>
      </div>
    `
    document.body.appendChild(gate)

    // Seite anzeigen (nur Gate sichtbar, Inhalt dahinter versteckt)
    document.documentElement.style.visibility = ''

    function unlock() {
      const val = document.getElementById('ie-gate-input').value
      if (val === PASS) {
        sessionStorage.setItem(KEY, '1')
        document.getElementById('ie-gate').remove()
      } else {
        document.getElementById('ie-gate-error').textContent = 'Falsches Passwort. Bitte erneut versuchen.'
        document.getElementById('ie-gate-input').value = ''
        document.getElementById('ie-gate-input').focus()
      }
    }

    document.getElementById('ie-gate-btn').addEventListener('click', unlock)
    document.getElementById('ie-gate-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') unlock()
      document.getElementById('ie-gate-error').textContent = ''
    })
    document.getElementById('ie-gate-input').focus()
  }

  if (document.body) {
    buildGate()
  } else {
    document.addEventListener('DOMContentLoaded', buildGate)
  }
})()
