/* ══════════════════════════════════════════════════════════════
   Immo.Expert – Excel-Datei (.xlsx) im Browser bauen
   Braucht nur JSZip (jszip.min.js). Mehrere Blätter möglich.

   IEXlsx.herunterladen('Datei.xlsx', [
     { name: 'Blatt', zeilen: [[{ t: 'Text', s: 1 }, { n: 12.5, s: 2 }, { s: 2 }]],
       fixX: 1, fixY: 4, breiten: [34, 12] }
   ])

   Stile: 0 normal · 1 fett · 2 Zahl #.##0,00 · 3 Zahl fett · 4 Kopfzeile (fett, hinterlegt)
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict'

  function spalte (n) {
    var s = ''
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
    return s
  }
  function esc (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function blattXml (b, erstes) {
    var daten = ''
    var maxSpalten = 1
    ;(b.zeilen || []).forEach(function (reihe, i) {
      var nr = i + 1
      var zs = ''
      maxSpalten = Math.max(maxSpalten, reihe.length)
      reihe.forEach(function (z, j) {
        if (!z) return
        var ref = spalte(j + 1) + nr
        var st = z.s ? ' s="' + z.s + '"' : ''
        if (z.t !== undefined) zs += '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + esc(z.t) + '</t></is></c>'
        else if (z.n !== undefined) zs += '<c r="' + ref + '"' + st + '><v>' + (Math.round(Number(z.n) * 100) / 100) + '</v></c>'
        else if (z.s) zs += '<c r="' + ref + '"' + st + '/>'
      })
      daten += '<row r="' + nr + '">' + zs + '</row>'
    })
    var fx = b.fixX || 0, fy = b.fixY || 0
    var pane = (fx || fy)
      ? '<pane' + (fx ? ' xSplit="' + fx + '"' : '') + (fy ? ' ySplit="' + fy + '"' : '') +
        ' topLeftCell="' + spalte(fx + 1) + (fy + 1) + '" activePane="' + (fx && fy ? 'bottomRight' : fy ? 'bottomLeft' : 'topRight') + '" state="frozen"/>'
      : ''
    var br = b.breiten || [34, 12]
    var cols = '<cols><col min="1" max="1" width="' + br[0] + '" customWidth="1"/>' +
      (maxSpalten > 1 ? '<col min="2" max="' + maxSpalten + '" width="' + (br[1] || 12) + '" customWidth="1"/>' : '') + '</cols>'
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView' + (erstes ? ' tabSelected="1"' : '') + ' workbookViewId="0">' + pane + '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' + cols +
      '<sheetData>' + daten + '</sheetData></worksheet>'
  }

  var STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEFEBE1"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border/></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="5">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'

  // Blattnamen: max. 31 Zeichen, ohne []:*?/\ und eindeutig
  function blattNamen (blaetter) {
    var vergeben = {}
    return blaetter.map(function (b, i) {
      var n = String(b.name || ('Blatt ' + (i + 1))).replace(/[\[\]:*?\/\\]/g, '-').trim().slice(0, 31) || ('Blatt ' + (i + 1))
      var basis = n, z = 2
      while (vergeben[n.toLowerCase()]) { var suf = ' (' + z++ + ')'; n = basis.slice(0, 31 - suf.length) + suf }
      vergeben[n.toLowerCase()] = true
      return n
    })
  }

  async function bauen (blaetter) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip nicht geladen')
    var namen = blattNamen(blaetter)
    var zip = new JSZip()
    var overrides = blaetter.map(function (_, i) {
      return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    }).join('')
    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      overrides +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>')
    zip.folder('_rels').file('.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>')
    zip.folder('xl').file('workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      namen.map(function (n, i) { return '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>' }).join('') +
      '</sheets></workbook>')
    zip.folder('xl').folder('_rels').file('workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      blaetter.map(function (_, i) {
        return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'
      }).join('') +
      '<Relationship Id="rId' + (blaetter.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>')
    zip.folder('xl').file('styles.xml', STYLES)
    blaetter.forEach(function (b, i) {
      zip.folder('xl').folder('worksheets').file('sheet' + (i + 1) + '.xml', blattXml(b, i === 0))
    })
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  }

  async function herunterladen (dateiname, blaetter) {
    var blob = await bauen(blaetter)
    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = dateiname
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(function () { URL.revokeObjectURL(a.href) }, 4000)
    return blob
  }

  window.IEXlsx = { bauen: bauen, herunterladen: herunterladen, spalte: spalte }
})()
