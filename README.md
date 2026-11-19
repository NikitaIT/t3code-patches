# t3code-patches

Small, reversible patches for the installed [T3 Code](https://github.com/pingdotgg/t3code) desktop
app on macOS. Each one edits a file inside the app's `app.asar` **in place**, keeping that file's
byte length exactly, so nothing is unpacked, repacked or copied. `undo` puts the original bytes
back, byte for byte.

```sh
git clone https://github.com/NikitaIT/t3code-patches.git
cd t3code-patches
./patch list
./patch apply look-up
```

Then quit T3 Code and open it again — the Electron main process reads `app.asar` at startup.

## Patches

| Patch | What it does |
| --- | --- |
| [look-up](patches/look-up/) | Adds a macOS **Look Up "word"** row above Cut in the right-click menu, opening the system dictionary panel on the selection. |

## Commands

```sh
./patch list                     # every patch, and whether it is applied
./patch apply look-up            # apply one; --all for every patch
./patch undo look-up             # take it back out
./patch files markdown           # search the app archive's file paths
./patch extract /apps/desktop/dist-electron/main.cjs   # write a file out to read
```

Every command takes `--app "/path/to/T3 Code.app"` to work on a bundle other than the installed one.
That is how you test a patch against a copy before touching the app you use.

Requirements: macOS, Node 18 or newer, and no other dependencies.

## How it works

An `.asar` archive is a JSON header followed by every file's bytes, and the header carries each
file's offset and size. Rewriting one file at exactly its original length therefore keeps every
other offset in the archive valid — no repack, no 250 MB backup, no rebuild of the app.

The patch pays for itself in whitespace. The bundles ship with their indentation intact, so a patch
names a region around its insert point, the runner collapses the line breaks and tabs in that
region, spends the freed bytes on the patch, and pads whatever is left with spaces. JavaScript does
not care; the byte count does not move. If a region is too tight, the runner says how many bytes it
is short instead of writing anything.

Before anything is written, the whole patched file is compiled with `node:vm` as a syntax check. A
patch that would not parse is refused, and the app is left alone.

`apply` records the bytes it replaced in `~/.local/state/t3code-patches.json`, so `undo` restores
them exactly. Without that file `undo` still works: it blanks the patch out with filler of the same
length, which a later `apply` can reclaim.

## What this costs you

- **The code signature no longer validates.** `codesign --verify` fails on a patched bundle. The app
  still launches — macOS checks the signed main executable, which is untouched — but you are running
  a bundle Apple's notarization no longer vouches for. `./patch undo` makes it valid again.
- **Every app update wipes the patch.** An update replaces `app.asar` wholesale. Re-run
  `./patch apply --all` afterwards; `./patch list` tells you where you stand.
- **An anchor can move.** Patches find their place by searching for code, not by offset, so they
  survive small rebuilds. When T3 Code changes the code a patch targets, `apply` refuses and says so
  rather than guessing.

## Why patches and not pull requests

T3 Code is MIT and its source is public, but
[CONTRIBUTING.md](https://github.com/pingdotgg/t3code/blob/main/CONTRIBUTING.md) is explicit that
outside feature PRs are closed, and it names "new features", "UI overhauls" and "architecture
overhauls (extensions, plugins, new connection methods)" among them. Feature requests belong in
their [Ideas discussions](https://github.com/pingdotgg/t3code/discussions/categories/ideas). This
repository is for the meantime: run what you want on your own machine, and keep it reversible.

## Writing another patch

See [AGENTS.md](AGENTS.md) — the patch contract, how to find an anchor that lasts, how much slack a
region has, and how to test against a copy before touching the app you use.

MIT licensed. Not affiliated with T3 Tools, Inc.
