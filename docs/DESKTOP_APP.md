# Desktop app

`desktop/` holds Modwerk's desktop app for Windows, macOS and Linux: modwerk.app in an Electron window. It brings the site's USB link (WebUSB) and Web MIDI to people who don't use Chrome, and the agent bridge to developers. It is a separate package with its own lock file, so the site's `npm ci` does not download Electron.

## Run it

```sh
cd desktop
npm ci
npm start                                    # modwerk.app
npm start -- --url http://127.0.0.1:5173/    # a local Vite server (not in a packaged app)
npm start -- --bridge                        # start with the agent bridge on
npx electron-builder                         # an installer for this computer, unsigned
```

The bridge and window rules are tested by the site's `npm test` (`desktop/src/*.test.mjs`); the window itself is not.

## What the window allows

The rules live in [`desktop/src/site.mjs`](../desktop/src/site.mjs), apart from Electron, so they are tested in plain Node.

- **One site.** A packaged app loads `https://modwerk.app/` only. `--url` and `MODWERK_DESKTOP_URL` work in development, for HTTPS or a site on this computer.
- **Navigation.** The site and the sign-in providers (GitHub, Google, Discord) stay in the window; every other link opens in the default browser; anything else is blocked. The user agent names `ModwerkDesktop` instead of Electron so providers treat the window as Chrome.
- **Permissions.** MIDI with SysEx, clipboard writes, full screen and notifications, for the site's origin only. USB goes to the site only, only for Elektron devices, and only while the agent bridge is off.
- **The device chooser.** The site's own filters pick the Octatrack. With one unit the app hands it over without a chooser; with several it asks which one.
- **No Node in the page.** Context isolation and the sandbox are on, there is no preload, and webviews are refused.

The link itself is the site's: the same `OctatrackLink`, sync and base install as in Chrome. The operating system's limits stay: Linux needs the udev rule (Setup → Can't connect?), and on Windows WinUSB binds only to the base's interface, so a unit on the original OS can't be opened over USB.

## The agent bridge

**Developer → Agent bridge** serves the USB bench line protocol that `scripts/octatrack-usb-bridge.py` serves, from [`desktop/src/bridge.mjs`](../desktop/src/bridge.mjs) with [node-usb](https://github.com/node-usb/node-usb-rs) (WebUSB calls; WinUSB on Windows, no libusb or Python). `npm run device` and the [developer MCP](FRONTEND_MCP.md) use it unchanged:

- macOS and Linux: `/tmp/modwerk-ot.sock` (mode 0600), `scripts/device.mjs`'s default.
- Windows: TCP `127.0.0.1:50123`, so `--socket 50123` (WSL with mirrored networking reaches it too).
- `--bridge-socket` or `MODWERK_BRIDGE_SOCKET` sets another address.

It behaves like the Python bridge: control transfers only, it claims only the Modwerk vendor interface (class 0xff, subclass 0x4d, protocol 1), it never sends SET_ADDRESS or SET_CONFIGURATION, never resets the bus and never repeats a transfer. A unit that goes away (a RAM boot, a replug) is found again on the next request. Differences: it serves one client at a time and turns a second away, it waits for a unit instead of exiting, and it refuses to start over another bridge's live socket.

The site and the bridge never share the unit: turning the bridge on or off reloads the page, and while it is on the site gets no USB access. The window title says when the bridge is on and where.

## Not done yet

Untested on hardware and on each operating system; no icons, code signing, notarization, auto-update or CI build. The installer does not set up the Linux udev rule.

## Plan

**Next for the desktop app**

1. A first run on each operating system against a unit: sync, base install, bridge with `npm run device -- status` and the MCP.
2. Icons, code signing (an Apple Developer ID and a Windows certificate, an owner decision because both cost money) and auto-update from GitHub Releases.
3. A CI build for `desktop/` (a workflow, so an owner-reviewed change).

**Things the browser can't do**

- **First install over USB.** On Windows, a unit still on the original OS can't be opened at all ([finding 44](OCTATRACK_BETA_TEST_PLAN.md)), so the first base goes on via the card. An installer that sets up the WinUSB driver (and the udev rule on Linux) would let a musician go from the stock OS to a Modwerk base without removing the card. Probably the biggest single win for new users.
- **Every USB audio channel.** Browsers usually expose stereo. The app could record all 20 USB channels, for stem recording, the tuner and the bit-exact A/B audio checks testers now run with Python scripts.
- **Direct card access.** Write `MODWERK0.SET` and base files, back up sets and projects, and move samples, in every operating system's file system, not only Chrome's File System Access API.
- **Running in the background.** A tray icon showing the unit, its base version and whether an update is due; it reconnects after a power cycle and notifies when a module you use has an update.

**Every developer tool in the app**

The aim: install the app, turn on Developer mode, and have everything [Your development setup](DEVELOPER_WORKFLOW.md#your-development-setup) asks for today. The tools themselves stay in the developer's checkout: `pr:ready`, the doctor, the generators and the MCP are versioned with the repository, and a frozen copy in the app would drift from what CI checks. The app supplies everything around them and runs them. Musicians download none of it: Developer mode fetches it on demand.

1. **One-click setup.** Sign in to GitHub in the browser, fork and clone (or choose an existing checkout), then a managed folder outside the repository with pinned Node 24, Python 3.12, the m68k GCC 16.2 toolchain and `dsp_asm`, each checked by hash; `npm ci`, the board login and the skills; the MCP registered with Claude Code and Codex. It replaces the setup prompt's manual steps and Docker for the dev loop.
2. **The MCP and the bridge as one.** The app starts `frontend-mcp.mjs` from the checkout with the bridge's socket, so an agent connects with one config line and nobody starts processes by hand.
3. **A Developer page.** The unit (status, trial, Keep or Undo, screen, keys, log), the doctor's verdict for the module being worked on and the pull request's `pr:ready` state, as buttons over the same commands an agent runs.
4. **Remote debug sessions** (#725). A member consents and a maintainer reads their unit live; an app keeps that link up more reliably than a tab.

What decides how far this goes:

- **Reproducible builds.** Reviewed packages must rebuild byte for byte with the pinned toolchain. The native copy on Linux matches the Docker image (verified 26 October 2026); a macOS or Windows build of GCC needs the same proof before its output counts, and until then Docker or Linux stays the reference.
- **Windows.** The SDK tests and native builds run on Linux and macOS, and the MCP refuses native Windows until its private-file permissions are done. The proven combination is the one in use today: the tools in WSL, set up by the app, and USB on Windows through the bridge.
- **Licences.** Shipped as separate programs, each under its own licence with its source offered: GCC and `dsp_asm` (GPL-3.0), Elekloader (GPL-2.0), octabam's build tools (MIT). The ELv2 pipeline scripts run from the checkout, never inside the GPL app.

**No emulation in the app** (owner, 18 November 2026). The app never runs stock firmware: no emulator ships in it, Developer mode does not fetch or start one, and the Developer page works on the unit. The emulators stay developer tools built from source with `npm run upstream:tools`.

**Later**

- The same USB link for Digitakt, Digitone and Rytm as their links appear.
- Unattended long trials, and diagnostics bundles sent with consent.

**iPad.** Electron does not run there, iPad browsers have no WebUSB or Web MIDI, and iPadOS gives apps no vendor USB interface. The route:

1. Now: check the card route on an iPad (build in Safari, save to Files, copy to the card through a reader or the unit's USB disk mode); [test plan](OCTATRACK_BETA_TEST_PLAN.md) case 1.4.
2. A link over class-compliant USB MIDI SysEx in the Octatrack base, which iPadOS reaches through CoreMIDI without special entitlements. The Rytm already has one in its development bases, the Digitakt II plans one, and the site's link then needs a transport that is not WebUSB (Web MIDI in Chrome).
3. A small iPad app showing modwerk.app with a CoreMIDI transport, the same pattern as this app.

A DriverKit driver for the vendor interface is the fallback: M-series iPads only, and it needs an entitlement from Apple.

**Elektron firmware in the app** (owner decision, not started). Elektron wants to collaborate; shipping their OS files, for every Elektron machine Modwerk supports (not the Zoom MS-70CDR's), would spare musicians finding the right file. Before any code: written terms that name the files and OS versions, the channels (site, app, CI) and whether patched images built from them may be distributed. The preferred design is that the app fetches the stock OS from Elektron's own download and checks a pinned hash, rather than bundling it, so firmware still never enters Git or CI. AGENTS.md, [LEGAL_COMPLIANCE.md](LEGAL_COMPLIANCE.md) and the site's "firmware stays on your device" copy change only with those terms, each in an owner-reviewed pull request.

**Out of scope.** Nothing here becomes a companion that mirrors what Elektron sells (Overbridge); see the [modding guidelines](../MODDING_GUIDELINES.md).
