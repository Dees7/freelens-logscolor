# freelens-logscolor

A [Freelens](https://freelens.app) extension that colorizes pod logs in the built-in log viewer:
JSON, logfmt, klog, levels, stack traces. It configures nothing and calls nowhere — it only adds
ANSI codes to text the viewer already knows how to show in color. On request it also installs
`lc`, a terminal command that colors your own logs the same way.

> На русском — [README.ru.md](README.ru.md).

![Colored pod logs](logscolor.png)

## 🚧 Requirements

- Freelens 2.x — install a `2.x.y` release
- Freelens 1.x or Lens 6.x — install a `1.x.y` release

The package major always matches the host major. That is the only thing to remember when picking
a version.

## 🧰 Installing

The extension is not published to npm, so it is installed from the `.tgz` attached to its
[GitHub release](https://github.com/Dees7/freelens-logscolor/releases). Make sure the app is
running, and follow these steps:

1. Go to the Extensions view (`Menu -> File -> Extensions`)
2. Paste the release asset URL for your host:

   | Host | URL |
   |---|---|
   | Freelens 2.x | `https://github.com/Dees7/freelens-logscolor/releases/download/v2.0.4/freelens-logscolor-2.0.4.tgz` |
   | Freelens 1.x, Lens 6.x | `https://github.com/Dees7/freelens-logscolor/releases/download/v1.0.4/freelens-logscolor-1.0.4.tgz` |

3. Click on the **Install** button
4. Make sure the extension is enabled

The app downloads and unpacks the archive itself. A `.tgz` you already have on disk works the
same way: drop the file onto the Extensions view, or give it the file path.

## 🎨 Features

```
2026-09-18T13:00:33Z {"level":"error","msg":"connect failed","pod":"api-7f9","attempt":3}
                      ╰ key colored by name    ╰ red          ╰ its own color  ╰ yellow
```

JSON, logfmt and klog lines are taken apart by key and by value type; the level is colored by
its level, under whatever name the logger gives that field (`level`, `lvl`, `severity`,
`levelname`, `log.level`, `severity_text`, `@level` …) and as a number too, on the scale of pino,
python or OpenTelemetry; panics and stack traces are marked as a whole. Each key's color comes
from the key name itself, so `pod` is always one color and `trace_id` another. Only escape codes
are added — the text of the line is never changed.

The full table of what gets colored, and the one setting there is, are in the README of your
branch.

## 🖥️ The `lc` command: your own logs in a terminal

```sh
kubectl logs -f my-pod | lc
tail -f app.log | lc | less -R
kubectl logs -f deploy/web --all-pods --all-containers | lc
```

The `[pod/…/…]` prefix of `--all-pods`, `--all-containers` and `-l` is dimmed, and the line behind
it is colored as usual. Put into a [crt-lens](https://github.com/Dees7/crt-lens) menu item,
`… logs {{kind}}/{{name}} --all-pods --all-containers -f | lc | grep --line-buffered -i error` gives
a colored **View all logs** of a whole workload; the full example is in the README of your branch.

The same coloring, outside the app. Nothing is installed together with the extension: you
install `lc` yourself and remove it the same way.

| Host | Where |
|---|---|
| Freelens 1.x, Lens 6.x | **Install lc** / **Remove lc** buttons in **Preferences → Extensions → freelens-logscolor**, or the command palette |
| Freelens 2.x | the command palette (Cmd+Shift+P): *Logs color: install the lc terminal command* / *… remove …*; the preferences page shows the state |

Freelens 2.x has no buttons because it does not share React with extensions, and the extension
works on a vanilla build without one.

`lc` needs [Node.js](https://nodejs.org) on PATH: without `node` it is not installed. It goes
into the first writable directory on PATH out of `~/.local/bin`, `~/bin`, `/opt/homebrew/bin`,
`/usr/local/bin`, is removed together with the extension, and never touches an `lc` that is not
its own. Not available on Windows.

## 📦 Where the code is

This branch holds only the README and the license. The extension exists as two incompatible
builds — Freelens 1.x and 2.x load extensions differently — and each lives in its own branch:

| Branch | Host | Package version | Release tag |
|---|---|---|---|
| [`v2`](../../tree/v2) | Freelens 2.x | `2.x.y` | `v2.0.0`, `v2.0.1`, … |
| [`v1`](../../tree/v1) | Freelens 1.x, Lens 6.x | `1.x.y` | `v1.0.0`, `v1.0.1`, … |

The branches are never merged into each other, and each releases on its own: different version
numbers, different artifacts, different hosts.

## Upgrading

Install the `.tgz` of the newer release the same way. The app asks for confirmation and removes
the installed copy before unpacking the new one.

**Then restart the app.** Installing over the old copy changes nothing in a window that is
already open: the extension wraps log reading once, when it activates, so until the restart the
window keeps running the wrapper of the previous version.

## Uninstalling

Go to the Extensions view and click the **Uninstall** button next to the extension.

## License

BSD 3-Clause, see [LICENSE](LICENSE).
