# Writing a patch

For agents and people adding to this repository. Read [README.md](README.md) first for what a patch
is and what it costs.

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

## The patch's README

`patches/<id>/README.md` carries: what it changes, a **before** and an **after** screenshot of the
real app, the code that is injected, where it goes and why there, how to run it, and anything it
does not do. Screenshots are the evidence that the patch works; a passing `apply` is not.

## Conventions

- Quit and reopen T3 Code to see a patch: the main process reads `app.asar` at startup.
- Commit messages are plain and in the present tense. No AI attribution trailers.
- One patch per folder, one concern per patch.
