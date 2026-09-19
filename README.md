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
   https://github.com/Dees7/freelens-logscolor/releases/download/v2.0.3/freelens-logscolor-2.0.3.tgz
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
| the level field (`level`, `lvl`, `severity`, `levelname`, `log.level`, `severity_text`, `@level` and more — see below) | colored by level: ERROR red, WARN yellow, INFO green, DEBUG magenta, FATAL bright red |
| logfmt (`key=value`) | the same, by key and by value type |
| klog (`I0918 13:00:33.350123 1 controller.go:42]`) | the level letter is colored, the rest of the header is faint |
| `panic:`, `fatal error:`, `Traceback` | the whole line is red |
| stack traces (`at …`, `Caused by:`, `… 12 more`, `goroutine N [running]:`, `File "x", line N`) | faint |
| anything else | the level word if it is recognized, plus the tokens below |

### Tokens recognized in any format

Most pod logs are neither JSON nor logfmt — they are plain lines, and there is nothing to take
apart in them. What can still be found there are pieces you cannot mistake for anything else:

| Token | How |
|---|---|
| IPv4 and IPv6 addresses, with a port or a mask (`10.0.0.1:6432`, `[2a0d:d6c0:0:ff1b::1c5]:6432`) | cyan |
| URLs (`https://api.example.com/v1/pods?limit=100`) | cyan |
| UUIDs | magenta |
| `SHOUTY_SNAKE_CASE` names (`SECONDARY_KUBELET_OPTS`, `LOG_LEVEL`) | colored by the name, like a key |
| command-line flags (`--cluster-dns`, `-v`) | colored by the name, like a key |
| numbers with a unit (`50Mi`, `250ms`, `1h30m`, `95%`) | yellow |

They are highlighted in plain lines and inside values that have no color of their own — an IP in
`msg` is the usual case. A line that is already colored as a whole (a panic, a stack trace) is
left as it is: a color inside a color would cancel the outer one.

What merely looks like an address stays untouched: a time (`13:00:30`), a version (`v1.5.2`), a
date, an impossible octet (`999.1.1.1`). A bare number is not highlighted either — only a number
with a unit — otherwise every digit in the line would light up.

### The level field: names and numbers

Every logger names that field differently. These names are recognized, case-insensitively:
`level`, `lvl`, `severity`, `logLevel`, `log_level`, `levelname` (python `logging`, structlog),
`log.level` (ECS/Elastic), `severity_text` and `severityText` (OpenTelemetry), `@level` (Vault,
Nomad, Terraform).

A number instead of a word counts as a level too, on the scale of the logger that writes it:

| Key | Scale |
|---|---|
| `level`, `lvl`, `logLevel`, `log_level`, `log.level`, `@level` | pino and bunyan: 10 trace, 20 debug, 30 info, 40 warn, 50 error, 60 fatal |
| `levelno` | python `logging`: 10 debug, 20 info, 30 warning, 40 error, 50 critical |
| `severityNumber`, `severity_number` | OpenTelemetry: four numbers per level, 1-24 |

The scale is picked by the key name, not by the number: the same `20` is debug for pino and info
for python, so the value alone cannot tell them apart. A numeric `severity` is deliberately left
out: in syslog it is inverted (0 is emerg, 7 is debug), so either scale would color it backwards
— it stays an ordinary number.

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

**Then restart Freelens.** Installing over the old copy changes nothing in a window that is
already open: the extension wraps log reading once, when it activates, so until the restart the
window keeps running the wrapper of the previous version.

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
