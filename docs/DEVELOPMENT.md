# Developing SlotForge Frame

## Run it

Needs Node.js 22 or newer (the release builds use Node.js 24). Install once; this also fetches the Electron desktop runtime:

```
npm install
```

- `npm start` builds the page and opens the Frame window.
- `npm run dev` serves the page in a browser while you work on the code (http://127.0.0.1:5191). In a browser the library is kept in the browser's own storage; the desktop app keeps it in `library.sqlite`.
- `npm test` runs the unit tests: the geometry engine, the model, the library, the Anvil link and the update check.
- `npm run test:ui` drives the built page in a headless browser (the installed Microsoft Edge) and clicks through the tools. Run `npm run build` first.
- `npm run test:desktop` starts the built desktop app on a throwaway data folder and checks that it opens with its top bar, menus, first build, pictures, library and update check. With `SLOTFORGE_APP` set to a packaged program, it tests that copy instead.

## How it is put together

- `src/model.js` is the design: plain data, its defaults, its checks, and reading and cleaning files.
- `src/geometry/engine.js` turns a design into solids with manifold-3d. It runs in a Web Worker (`engine.worker.js`) and is also called directly by the unit tests.
- `src/main.js` is the page: menus, panels, the top view and the 3D view (`viewport3d.js`).
- `src/components.js` holds the tables of bought parts; `src/library-core.js` and `src/library.js` the library; `src/anvil.js` the link with SlotForge Anvil.
- `desktop/` is the Electron shell: the window, the library file (`library.cjs`, on `node:sqlite`) and the update check.

The car's frame is the same as Anvil's: millimetres, Z up, the track at Z = 0, the centre line at Y = 0, and X running from the front to the back with X = 0 at the front axle.

The build is one offline page, `dist/index.html`. Nothing else of the page is shipped, so pictures are imported with `?inline`, and `src/update-ui.js` is imported last in `src/main.js` (see the note there).

## Downloads and builds

| | Installer | Portable |
|---|---|---|
| Windows | `SlotForgeFrame-<version>-Setup-x64.exe` | `SlotForgeFrame-<version>-Portable-x64.exe`, or `…-Windows-x64.zip` (unzip anywhere, run `SlotForgeFrame.exe`) |
| macOS (Intel and Apple silicon) | `SlotForgeFrame-<version>-mac-universal.dmg` | `…-mac-universal.zip` |
| Linux (x64 and arm64) | `SlotForgeFrame-<version>-linux-<arch>.deb` | `…-linux-<arch>.AppImage` |

- Windows: `npm run dist:win` builds all three into `dist/desktop/v<version>/`; `npm run dist:zip` builds only the zip.
- macOS and Linux are built by GitHub (`.github/workflows/native-release.yml`) when a release is published. They are tested on each system and attached to the same release. `npm run dist:mac` and `npm run dist:linux` work on those systems too.
- `npx electron desktop/make-icons.cjs` redraws `desktop/build/icon.png` and `icon.ico` from `src/assets/slotforge-frame.svg`.

## Releases

1. Set the version in `package.json` and run `npm run dist:win`.
2. Commit, tag `v<version>` and push the tag.
3. Publish a GitHub release for the tag with the Windows files and `SHA256SUMS-win-x64.txt` attached. The macOS and Linux files follow.

Release notes need a `## What's new` section with `- **Title:** text` lines: the update window in the app shows them.

## Updates and theme

Updates work as in the other SlotForge apps: `desktop/update-check.cjs` and `src/update-ui.js` are the same files as Anvil's and Foundry's. An installed or portable copy asks GitHub for the newest release a few seconds after it starts; a development copy only checks when asked in Settings. The releases are looked for at the `homepage` in `package.json`.

The Light / Dark theme is `src/app-theme.js`, also from Foundry. It is saved under the shared SlotForge key, so the apps on one computer follow the same choice.

## Test parts

Bought or downloaded chassis, pods and bodies used for testing are never added to this project or to a build. The tests make their own simple shapes. `tests/anvil.test.js` uses SlotForge Anvil's own code when its project folder lies beside this one, and skips those checks otherwise.

## Planning documents

[plan.md](../plan.md), which also lists every milestone and where the build stands, [research.md](../research.md) and [parts-data.md](../parts-data.md).
