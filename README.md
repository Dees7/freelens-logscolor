# freelens-logscolor (Freelens 2.x)

A [Freelens](https://github.com/freelensapp/freelens) extension that colorizes pod logs in the
**built-in** log viewer — the one the **Logs** button opens. That is all it does: no extra menu
items, no extra columns, no panels of its own.

> This is the branch for Freelens 2.x. For Freelens 1.x and Lens 6.x use [`v1`](../../tree/v1),
> the overview of both is in [`main`](../../tree/main).
> На русском — [README.ru.md](README.ru.md).

![Colored pod logs](logscolor.png)

## 🚧 Requirements

- Freelens `>= 2.0.0`

The package major always matches the host major, so `2.x.y` releases are for Freelens 2.x. On
Freelens 1.x or Lens 6.x install a `1.x.y` release instead — see [`v1`](../../tree/v1).

## 🧰 Installing

The extension is not published to npm, so it is installed from the `.tgz` attached to its
[GitHub release](https://github.com/Dees7/freelens-logscolor/releases). Make sure Freelens is
running, and follow these steps:

1. Go to the Extensions view (`Menu -> File -> Extensions`)
2. Paste the release asset URL for Freelens 2.x:

   ```
   https://github.com/Dees7/freelens-logscolor/releases/download/v2.0.1/freelens-logscolor-2.0.1.tgz
   ```

3. Click on the **Install** button
4. Make sure the extension is enabled

Freelens downloads and unpacks the archive itself. A `.tgz` you already have on disk works the
same way: drop the file onto the Extensions view, or give it the file path.

## 🎨 Features

Open the logs of any pod — the lines are colored as they arrive:

| Format | How |
|---|---|
| JSON | each key gets its own color (see below), string values keep the theme color, numbers are yellow, `true`/`false`/`null` are magenta, braces and commas are faint |
| `level` / `lvl` / `severity` | colored by level: ERROR red, WARN yellow, INFO green, DEBUG magenta, FATAL bright red |
| logfmt (`key=value`) | the same, by key and by value type |
| klog (`I0918 13:00:33.350123 1 controller.go:42]`) | the level letter is colored, the rest of the header is faint |
| `panic:`, `fatal error:`, `Traceback` | the whole line is red |
| stack traces (`at …`, `Caused by:`, `… 12 more`, `goroutine N [running]:`, `File "x", line N`) | faint |
| anything else | the level word if it is recognized, everything else untouched |

A key's color is derived from the key name itself, so `pod` is always one color and `trace_id`
another, and you can find the field you need without reading the line. The same name gets the
same color in JSON and in logfmt.

Only escape codes are added — the text of the line is never changed. Broken JSON does not break
the line, quotes are not re-escaped, and the leading kubernetes timestamp is left alone so that
the viewer keeps loading older logs correctly.

## ⚙️ Preferences

There are almost none: the extension is on by default, because that is exactly what it is
installed for. To switch it off without uninstalling, create
`~/.freelens/freelens-logscolor.json`:

```json
{ "enabled": false }
```

The change takes effect at once, no window reload needed. The extension deliberately has no
section on the Freelens preferences page.

## Upgrading

Install the `.tgz` of the newer release the same way. Freelens asks for confirmation and removes
the installed copy before unpacking the new one.

## Uninstalling

Go to the Extensions view and click the **Uninstall** button next to the extension.

## Building from source

```sh
git clone https://github.com/Dees7/freelens-logscolor.git
cd freelens-logscolor
git switch v2
npm install && npm run build
mkdir -p ~/.freelens/extensions
ln -s "$PWD" ~/.freelens/extensions/freelens-logscolor
```

Then Cmd+R in the Freelens window. `npm run check` runs types, tests, build and smoke;
`npm run pack` produces the `.tgz`. More detail — in [README.ru.md](README.ru.md).

## License

BSD 3-Clause, see [LICENSE](LICENSE).
