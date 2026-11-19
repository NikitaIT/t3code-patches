'use strict'

// What `apply`, `undo` and `status` do for every patch in patches/.
//
// A patch says where it goes and what to put there; this decides whether that
// is safe, writes it, and remembers the bytes it replaced so `undo` can put
// the app back exactly as its publisher signed it.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')

const { fail, locate, read, write } = require('./asar')
const { bytes, filler, spliceSameLength } = require('./splice')

const PATCHES = path.join(__dirname, '..', 'patches')

const STATE = path.join(
  process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local/state'),
  't3code-patches.json',
)

const load = () => {
  const dirs = fs.existsSync(PATCHES) ? fs.readdirSync(PATCHES).sort() : []

  return dirs
    .filter(dir => fs.existsSync(path.join(PATCHES, dir, 'patch.js')))
    .map(dir => {
      const patch = require(path.join(PATCHES, dir, 'patch.js'))
      for (const key of ['id', 'title', 'file', 'mark', 'code', 'place']) {
        if (!patch[key]) fail(`patches/${dir}/patch.js has no ${key}`)
      }
      if (patch.id !== dir) fail(`patches/${dir}/patch.js calls itself ${patch.id}`)
      if (!patch.code.startsWith(patch.mark)) fail(`${patch.id}: code must start with its mark`)

      return { ...patch, dir: path.join(PATCHES, dir) }
    })
}

const find = id => load().find(one => one.id === id) ?? fail(`no patch called ${id}`)

const readState = () => {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'))
  } catch {
    return {}
  }
}

const writeState = state => {
  fs.mkdirSync(path.dirname(STATE), { recursive: true })
  fs.writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`)
}

/** Syntax-check the whole file before it goes over a working app. */
const check = (text, what) => {
  try {
    new vm.Script(text, { filename: 'patched.js' })
  } catch (cause) {
    fail(`${what} does not parse (${cause.message}) — nothing was written`)
  }
}

const isApplied = (patch, app) => read(locate(app, patch.file)).includes(patch.mark)

const status = (patch, app) => ({
  id: patch.id,
  title: patch.title,
  applied: isApplied(patch, app),
})

const apply = (patch, app) => {
  const where = locate(app, patch.file)
  const source = read(where)
  if (source.includes(patch.mark)) return `${patch.id}: already applied`

  const spot = patch.place(source)
  if (!spot) {
    return fail(
      `${patch.id}: its anchor is gone — this build of the app moved the code it patches`,
    )
  }

  const { from, to, at } = spot
  const region = source.slice(from, to)
  const other = region.match(/\/\*t3-[a-z0-9-]+\*\//)
  if (other) fail(`${patch.id}: ${other[0]} already owns these lines; undo that patch first`)

  const patched = spliceSameLength({ source, from, to, at, code: patch.code })
  check(patched, `${patch.id}'s result`)

  const state = readState()
  state[patch.id] = { app, file: patch.file, from, to, original: region }
  write(where, patched)
  writeState(state)

  return `${patch.id}: applied — quit the app and open it again`
}

const undo = (patch, app) => {
  const where = locate(app, patch.file)
  const source = read(where)
  if (!source.includes(patch.mark)) return `${patch.id}: not applied`

  const state = readState()
  const saved = state[patch.id]

  // Exact restore: the saved bytes go back only if they still line up with
  // what is in the file, so a patched, updated or hand-edited app is left to
  // the plain removal underneath.
  if (
    saved &&
    saved.app === app &&
    saved.file === patch.file &&
    source.slice(saved.from, saved.to).includes(patch.mark) &&
    bytes(source.slice(saved.from, saved.to)) === bytes(saved.original)
  ) {
    const restored = source.slice(0, saved.from) + saved.original + source.slice(saved.to)
    check(restored, `${patch.id}'s restore`)
    write(where, restored)
    delete state[patch.id]
    writeState(state)

    return `${patch.id}: removed, byte for byte — quit the app and open it again`
  }

  const from = source.indexOf(patch.mark)
  if (source.slice(from, from + patch.code.length) !== patch.code) {
    return fail(`${patch.id}: the patched code was edited by hand — take it out yourself`)
  }

  const restored =
    source.slice(0, from) + filler(patch.code.length) + source.slice(from + patch.code.length)
  check(restored, `${patch.id}'s restore`)
  write(where, restored)
  delete state[patch.id]
  writeState(state)

  return `${patch.id}: removed — quit the app and open it again`
}

module.exports = { apply, find, isApplied, load, status, undo, STATE }
