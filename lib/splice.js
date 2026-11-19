'use strict'

// Putting code into a bundled file without changing its byte length.
//
// The bundles ship with their indentation intact, and JavaScript does not care
// how much of it there is. So an insert pays for itself: the lines around it
// are squeezed, the freed bytes hold the new code, and whatever is left over
// becomes trailing spaces. Byte length in, byte length out.

const { fail } = require('./asar')

const bytes = text => Buffer.byteLength(text, 'utf8')

/**
 * The slack a patch may spend: line breaks with their indentation, and the
 * filler an earlier `undo` left behind. Nothing else is touched, so no string
 * literal in the bundle can be caught by it.
 */
const SLACK = /\n\t+|\/\*t3-slack *\*\//g

const squeeze = text => text.replace(SLACK, match => (match.startsWith('\n') ? ' ' : ''))

/**
 * @param source the whole file
 * @param from   start of the region whose indentation pays for the insert
 * @param to     end of that region
 * @param at     where inside the region the code goes (from <= at <= to)
 * @param code   one line of JavaScript, no newlines
 * @returns the file with `code` spliced in, the same byte length as before
 */
const spliceSameLength = ({ source, from, to, at, code }) => {
  if (!(from <= at && at <= to)) fail(`the insert point ${at} is outside its region ${from}..${to}`)
  if (code.includes('\n')) fail('patch code must be one line: a newline would need its own slack')

  const region = source.slice(from, to)
  const rewritten = squeeze(source.slice(from, at)) + code + squeeze(source.slice(at, to))
  const room = bytes(region) - bytes(rewritten)

  if (room < 0) {
    fail(
      `this region has ${bytes(region) - bytes(squeeze(region))} bytes of slack and the patch ` +
        `needs ${bytes(code)}: widen the region or shorten the code (${-room} bytes over)`,
    )
  }

  return source.slice(0, from) + rewritten + ' '.repeat(room) + source.slice(to)
}

/** What `undo` writes in a patch's place: the same length, and reclaimable. */
const filler = length =>
  length < 12 ? ' '.repeat(length) : `/*t3-slack${' '.repeat(length - 12)}*/`

module.exports = { bytes, filler, spliceSameLength, squeeze }
