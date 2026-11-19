'use strict'

// Restarting the app from inside it.
//
// A patch only takes effect when the Electron main process reads app.asar
// again, so it needs a restart — and whoever asks for one usually lives inside
// the app being restarted: an agent in a T3 Code session, a terminal in its
// window. Quitting the app therefore kills the thing that asked.
//
// So the work is handed to a process that outlives the caller: spawned
// detached, in a session of its own, with its output let go. It runs once and
// exits. Nothing is installed and nothing is scheduled.
//
// Do NOT reach for `launchctl submit` here: jobs submitted that way default to
// KeepAlive, so launchd runs the script again every time it exits, and the app
// quits and reopens in a loop that the caller is no longer alive to stop.

const { spawn } = require('node:child_process')
const path = require('node:path')

const quote = text => `'${text.split("'").join(`'\\''`)}'`

/**
 * Quits the app and opens it again, from a process that survives this one.
 *
 * @param app     the bundle, e.g. /Applications/T3 Code (Beta).app
 * @param delay   seconds to wait first, so the caller can finish and say so
 * @returns the detached process's pid
 */
const restart = (app, { delay = 3 } = {}) => {
  const name = path.basename(app, '.app')

  // `pgrep -f` cannot see this app's main process — a hardened runtime keeps
  // its argv unreadable, so only the helpers match. AppleScript's `is running`
  // reads the process list instead, and needs no permission of its own.
  const running = `osascript -e ${quote(`application "${name}" is running`)} 2>/dev/null`

  const script = [
    `sleep ${Number(delay) || 0}`,
    // Ask it to quit the way the Quit menu item does, so it saves its state.
    `osascript -e ${quote(`tell application "${name}" to quit`)} >/dev/null 2>&1 || true`,
    `for _ in $(seq 1 40); do`,
    `  [ "$(${running})" = "true" ] || break`,
    `  sleep 1`,
    `done`,
    `sleep 1`,
    // On an app that refused to quit this only brings it forward, so the worst
    // case is no restart at all, never a half-killed app.
    `open -a ${quote(app)}`,
  ].join('\n')

  const child = spawn('/bin/bash', ['-c', script], {
    detached: true, // its own session: the caller's death does not reach it
    stdio: 'ignore',
  })
  child.unref()

  return child.pid
}

module.exports = { restart }
