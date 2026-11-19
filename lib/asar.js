'use strict'

// Reading and writing one file inside an Electron app.asar, in place.
//
// An asar archive is a JSON header followed by every file's bytes, and the
// header holds each file's offset and size. Writing a file back at the same
// byte length therefore needs no repack and leaves every other offset valid.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const APPS = [
  '/Applications/T3 Code (Beta).app',
  '/Applications/T3 Code.app',
  path.join(os.homedir(), 'Applications/T3 Code (Beta).app'),
  path.join(os.homedir(), 'Applications/T3 Code.app'),
]

class PatchError extends Error {}

const fail = message => {
  throw new PatchError(message)
}

/** The app bundle to work on: the one given, or the first one installed. */
const findApp = given => {
  if (given) {
    if (!fs.existsSync(path.join(given, 'Contents/Resources/app.asar'))) {
      fail(`no Contents/Resources/app.asar under ${given}`)
    }

    return given
  }

  const found = APPS.find(one => fs.existsSync(path.join(one, 'Contents/Resources/app.asar')))

  return found ?? fail(`no T3 Code in ${APPS.join(', ')} — pass --app <path to .app>`)
}

const readHeader = asar => {
  const fd = fs.openSync(asar, 'r')
  try {
    const head = Buffer.alloc(16)
    fs.readSync(fd, head, 0, 16, 0)
    const size = head.readUInt32LE(12)
    const buf = Buffer.alloc(size)
    fs.readSync(fd, buf, 0, size, 16)

    return { header: JSON.parse(buf.toString('utf8')), dataOffset: 16 + size }
  } finally {
    fs.closeSync(fd)
  }
}

/** Every file in the archive, by its path, for `patch files`. */
const list = asar => {
  const { header } = readHeader(asar)
  const out = []
  const walk = (node, prefix) => {
    for (const [name, entry] of Object.entries(node.files ?? {})) {
      const full = `${prefix}/${name}`
      if (entry.files) walk(entry, full)
      else out.push({ path: full, size: Number(entry.size ?? 0), unpacked: Boolean(entry.unpacked) })
    }
  }
  walk(header, '')

  return out
}

/** Where one file's bytes live: everything read and write need. */
const locate = (app, file) => {
  const asar = path.join(app, 'Contents/Resources/app.asar')
  if (!fs.existsSync(asar)) fail(`no app.asar under ${app}`)
  const { header, dataOffset } = readHeader(asar)

  let node = header
  for (const part of file.split('/').filter(Boolean)) {
    node = node.files?.[part]
    if (!node) fail(`${file} is not in this app.asar — the app's layout changed`)
  }
  if (node.files) fail(`${file} is a directory`)
  if (node.unpacked) fail(`${file} is stored outside the archive, in app.asar.unpacked`)

  return { app, asar, file, offset: dataOffset + Number(node.offset), size: Number(node.size) }
}

const read = where => {
  const fd = fs.openSync(where.asar, 'r')
  try {
    const buf = Buffer.alloc(where.size)
    fs.readSync(fd, buf, 0, where.size, where.offset)

    return buf.toString('utf8')
  } finally {
    fs.closeSync(fd)
  }
}

/** Writes the file back. Refuses anything that is not the original length. */
const write = (where, text) => {
  const buf = Buffer.from(text, 'utf8')
  if (buf.length !== where.size) {
    fail(`refusing to write ${buf.length} bytes over ${where.size}: the patch changed the length`)
  }

  const fd = fs.openSync(where.asar, 'r+')
  try {
    fs.writeSync(fd, buf, 0, buf.length, where.offset)
  } finally {
    fs.closeSync(fd)
  }
}

module.exports = { APPS, PatchError, fail, findApp, list, locate, read, write }
