# Contributing to ProVerlay

Thanks for your interest in ProVerlay! Bug reports, fixes, documentation and new
widgets are all welcome. By taking part you agree to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- **Bugs:** open an issue with the bug report template. Include your OS, how you run
  ProVerlay (Mac app or source), the browser or output host (OBS/vMix) and steps to
  reproduce.
- **Features:** open a feature request first for anything larger than a small fix,
  so we can agree on the approach before you spend time on it.
- **Security issues:** do not open a public issue — see [SECURITY.md](SECURITY.md).

## Development setup

You need **Node 22** (the version is pinned in `.nvmrc`) and git.

```bash
git clone https://github.com/Ferrywell/ProVerlay.git
cd ProVerlay
nvm use          # picks up .nvmrc; or install Node 22 another way
npm ci
npm run dev      # server with auto-restart → http://localhost:2014/control
```

Useful commands:

| Command | What it does |
|---------|--------------|
| `npm start` | Run the server |
| `npm run dev` | Run the server and restart on file changes |
| `npm test` | Run the test suite |
| `npm run app` | Run the Electron app from your working copy |
| `npm run dist:mac` | Build the Mac app (Apple Silicon) into `dist/` |

Your local projects live in `data/` (gitignored). To test with a clean slate, point
the server at an empty folder:

```bash
PROVERLAY_DATA_DIR=$(mktemp -d) npm run dev
```

### Companion module

```bash
cd companion
npm ci
npm run setup-dev        # links the module into ~/companion-module-dev
npm run test:connection  # needs a running ProVerlay server
```

See [companion/README.md](companion/README.md). The module is MIT-licensed; the rest
of the repository is GPL-3.0.

## Code style

- **Plain JavaScript ES modules**, no build step and no bundler. What is in
  `server/` and `public/` is what runs.
- Two-space indentation, single quotes, no semicolons — match the surrounding code.
- No frameworks in the browser UIs; shared UI code lives in `public/shared/`, design
  tokens in `public/shared/tahoe.css`.
- The render page (`public/render/`) must stay transparent and work in OBS and vMix
  (Chromium Embedded Framework). Keep animations light.
- Keep new dependencies to a minimum and explain why in the pull request.
- User-facing text and documentation are in English.

An [`.editorconfig`](.editorconfig) is included for basic whitespace settings.

## Branches and pull requests

1. Fork the repository (or create a branch if you have write access).
2. Create a branch from `main` with a descriptive name, e.g. `fix/ticker-speed` or
   `feat/logo-bug-widget`.
3. Make focused commits with clear messages (imperative mood: "Fix ticker speed on
   vMix").
4. Run the test suite with `npm test`, and check your change by hand in the dashboard,
   operator and render (see the [manual test plan](docs/QA-TEST-PLAN.md) for the
   relevant parts).
5. Update the docs and add an entry under **Unreleased** in
   [CHANGELOG.md](CHANGELOG.md) when the change is user-visible.
6. Open a pull request against `main` and fill in the template. Screenshots or a
   short recording help a lot for UI changes.

Pull requests are reviewed by the maintainers; please be patient and responsive to
feedback. Do not commit runtime data (`data/`), build output (`dist/`) or client
material you do not have the rights to share.

Releases are cut by tagging `main`; see [docs/RELEASING.md](docs/RELEASING.md).

## API changes

If you change a REST endpoint or Socket.io event, update
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and check the Companion module in
`companion/` still works.

## License

By contributing, you agree that your contributions are licensed under the
[GNU GPL v3](LICENSE) — or, for changes inside `companion/`, under the
[MIT license](companion/LICENSE).
