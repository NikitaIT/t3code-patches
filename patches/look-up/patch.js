'use strict'

// Look Up — the macOS dictionary panel, in T3 Code's right-click menu.
//
// T3 Code builds that menu in its Electron main process, in the handler it
// installs for webContents' "context-menu" event: a template of Cut, Copy,
// Paste and Select All, with Copy Link and Copy Image added when the pointer
// was on one. This puts one more entry in front of Cut, shown only when
// something is selected, which calls webContents.showDefinitionForSelection()
// — the same Look Up panel the rest of macOS shows, no Dictionary.app detour.
//
// The slack comes from the handler's own indentation, between the line that
// starts the template and the call that pops the menu up.

const CODE =
  '/*t3-look-up*/' +
  '{const s=(params.selectionText||"").split(/\\s+/).join(" ").trim();' +
  'if(s)menuTemplate.push({' +
  'label:\'Look Up \\u201c\'+(s.length>24?s.slice(0,24).trim()+"\\u2026":s)+\'\\u201d\',' +
  'click:()=>{if(!contents.isDestroyed())contents.showDefinitionForSelection()}' +
  '},{type:"separator"})}'

module.exports = {
  id: 'look-up',
  title: 'Look Up in the right-click menu',
  summary: 'Adds Look Up "word" above Cut, opening the macOS dictionary panel on the selection.',
  file: '/apps/desktop/dist-electron/main.cjs',
  mark: '/*t3-look-up*/',
  code: CODE,

  /** Where the row goes, and which lines pay for it. */
  place(source) {
    const at = source.search(/menuTemplate\.push\(\{\s*role: "cut"/)
    if (at === -1) return null

    const from = source.lastIndexOf('const menuTemplate = [];', at)
    const popup = source.indexOf('electronMenu.popupTemplate', at)
    if (from === -1 || popup === -1) return null

    const to = source.indexOf('});', popup) + 3
    if (to < at) return null

    return { from, to, at }
  },
}
