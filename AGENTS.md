# Writing a patch

For agents and people adding to this repository. Read [README.md](README.md) first for what a patch
is and what it costs.

## What you cannot do here

**You cannot see or operate the app's interface. Do not try, and do not agree to try.**

That means: you cannot take a screenshot of T3 Code, cannot open its right-click menu, cannot
click, type, scroll or select anything in it, and cannot confirm with your own eyes that a patch
looks right. No combination of `screencapture`, System Events, AppleScript UI scripting, synthetic
`CGEvent`s or an accessibility tree gets you there.

This is settled, not a limit to probe. It was tried in full, with every permission granted:

- Synthetic keystrokes went into the user's composer **while they were typing**, interleaving with
  their draft and corrupting it.
- Clicks landed in dead space every time. Screen coordinates read from a screenshot are already
  stale when the click runs, because the transcript scrolls as your own output appends to it.
- Each attempt raised another TCC prompt — Screen Recording, Automation, Accessibility — that the
  user had to stop and answer, and one of them (Accessibility for `/usr/bin/osascript`) cannot be
  granted by a prompt at all.

Three permissions, several interruptions, a damaged draft, and not one usable screenshot.

**When you are asked to verify a patch visually, say you cannot and offer the two things that
work:** run the patched bytes and show the result (see [Proving a patch works](#proving-a-patch-works)),
and ask the user for the screenshot. Refusing here is correct and costs nothing: the execution
harness is better evidence than a picture anyway — it proves what the code does, not what a menu
looked like once.

## Layout

```
patch                     the CLI: list, apply, undo, files, extract
lib/asar.js               finding the app, reading and writing one file inside app.asar
lib/splice.js             the byte-length-preserving insert, and the slack rules
lib/engine.js             apply / undo / status, the safety checks, the state file
patches/<id>/patch.js     one patch
patches/<id>/README.md    what it does, with before and after screenshots
```

## The contract

`patches/<id>/patch.js` exports exactly this:

```js
module.exports = {
  id: 'look-up',                                   // must equal the folder name
  title: 'Look Up in the right-click menu',        // one line, shown by `./patch list`
  summary: 'Adds Look Up "word" above Cut…',       // one sentence for the table in README.md
  file: '/apps/desktop/dist-electron/main.cjs',    // the path inside app.asar
  mark: '/*t3-look-up*/',                          // unique; `/*t3-<id>*/`
  code: CODE,                                      // ONE line of JavaScript, starting with mark
  place(source) {                                  // where it goes, or null if it cannot tell
    return { from, to, at }
  },
}
```

`place` receives the file as a string and returns three indices:

- `at` — where `code` is spliced in.
- `from` and `to` — the region whose indentation pays for it. `from <= at <= to`.

Return `null` when the anchor is not found. The runner then refuses with a clear message instead of
writing anything, which is what you want when an app update moves the code.

## Rules the runner enforces

- `code` is one line. A newline would need slack of its own, and the region is measured in bytes.
- `code` starts with `mark`, and `mark` is `/*t3-<id>*/`. `status` and `undo` find the patch by it.
- The region must not already hold another patch's mark. Overlapping patches are refused, because
  one `undo` would clobber the other.
- The patched file must compile (`node:vm`). It is checked before a single byte is written.
- The result must be the same byte length. The runner refuses anything else.

## Finding the place to patch

```sh
./patch files context          # search the archive's paths
./patch extract /apps/desktop/dist-electron/main.cjs main.cjs
```

The Electron main bundle is `/apps/desktop/dist-electron/main.cjs`; the renderer lives under
`/apps/server/dist/client/assets/`. The bundles keep their formatting and their string literals, so
grep for user-visible text, event names and API calls.

Anchor on code that has a reason to stay: an Electron API call, a channel name, a label. Never on a
byte offset, a minified identifier (`e`, `_t3s`) or a line number — those change with every build.
A regular expression tolerant of whitespace (`/menuTemplate\.push\(\{\s*role: "cut"/`) survives a
reformat; an exact long string does not.

## How much slack a region has

Run `./patch apply` against a copy. When the region is too tight the error names both numbers:

```
patch: this region has 289 bytes of slack and the patch needs 400 (111 bytes over)
```

Slack comes only from line breaks with their indentation, and from filler an earlier `undo` left.
Widen the region (`from`/`to`) over more indented lines, or write shorter code. Do not reach for
string literals or comments in the bundle — the squeeze deliberately leaves them alone so nothing
inside a string can be damaged.

## Testing before you touch the app you use

Clone the archive (instant on APFS, and it costs no space) and work on that:

```sh
S=$(mktemp -d)
mkdir -p "$S/fakeapp/Contents/Resources"
cp -c "/Applications/T3 Code (Beta).app/Contents/Resources/app.asar" "$S/fakeapp/Contents/Resources/"
shasum -a 256 "$S/fakeapp/Contents/Resources/app.asar"   # keep this

export XDG_STATE_HOME="$S/state"
./patch apply <id> --app "$S/fakeapp"
./patch undo  <id> --app "$S/fakeapp"
shasum -a 256 "$S/fakeapp/Contents/Resources/app.asar"   # must match the first one
```

Then check the stateless path, which is what a user with a lost state file gets:

```sh
./patch apply <id> --app "$S/fakeapp"
rm -rf "$S/state"
./patch undo  <id> --app "$S/fakeapp"
./patch apply <id> --app "$S/fakeapp"   # must succeed: undo leaves reclaimable filler
```

A patch ships only after all of that passes and you have seen it work in the running app.

## Proving a patch works

A passing `apply` proves nothing: it only says bytes were written. Prove the behaviour by running
the patched bytes. The menu-building block in `main.cjs` is self-contained, so it can be pulled
out of the live archive and executed with stubs:

```js
const { locate, read } = require('./lib/asar')
const src = read(locate(app, '/apps/desktop/dist-electron/main.cjs'))
const block = src.slice(src.indexOf('const menuTemplate = [];'), src.indexOf('runPromise(electronMenu.popupTemplate'))
const build = new Function('params', 'contents', /* …the block's other free names… */, `${block}\nreturn menuTemplate`)
```

Calling it with a fake `params` and `contents` gives the menu the real app would build, so you can
assert the row's label, its position, and what its `click` calls. That is evidence, it needs no
permissions, and it runs in a second.

Screenshots are for the README, not for verification — and they come from the user. Ask for one.

`patches/<id>/README.md` carries: what it changes, before and after screenshots of the real app,
the code that is injected, where it goes and why there, how to run it, and anything it does not
do.

## Restarting the app, for an agent

A patch only takes effect when the Electron main process reads `app.asar` again. If you are an
agent running inside a T3 Code session, quitting the app kills you — so hand the restart to a
process that outlives you, which is what `./patch restart` does:

```sh
./patch restart --delay 5
```

Say what is about to happen before you run it: the user's session ends with the app and returns
when it reopens.

Rules learned the hard way, do not repeat these:

- **Never `launchctl submit`.** It defaults to `KeepAlive`, so launchd reruns the script forever —
  the app quits and reopens every few seconds, and the session that scheduled it is gone. Recovery
  is `launchctl remove <label>`. A detached one-shot is what you want, never a job.
- **`pgrep -f` cannot see the app's main process.** Its hardened runtime keeps argv unreadable, so
  only the helper processes match and a wait loop exits immediately. Ask AppleScript instead:
  `osascript -e 'application "T3 Code (Beta)" is running'`.
- **Never drive the GUI.** No synthetic clicks, no keystrokes, no `screencapture`, no System
  Events. It does not work and it does damage: keystrokes land in whatever the user is typing
  into, and screen coordinates are stale by the time the click runs, because the transcript
  scrolls while you work. Each attempt also raises a TCC prompt (Screen Recording, Automation,
  Accessibility) that the user has to answer.

## Conventions

- Quit and reopen T3 Code to see a patch: the main process reads `app.asar` at startup.
- Commit messages are plain and in the present tense. No AI attribution trailers.
- One patch per folder, one concern per patch.
