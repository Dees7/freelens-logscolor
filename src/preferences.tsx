/**
 * Страница расширения в Preferences → Extensions: кнопки «поставить» и
 * «убрать» для команды `lc` (сама установка — в `cli.ts`).
 *
 * React свой не везём: Freelens 1.x и Lens 6.x кладут свой на
 * `globalThis.React` рядом с `LensExtensions`, и компоненты должны работать
 * именно с ним — второй экземпляр React в одном дереве ломает хуки. Поэтому
 * `react` в сборке подменяется глобалом (см. `vite.config.mjs`), а отсюда
 * берутся только типы. Кнопки — хостовые, из `Renderer.Component`, чтобы
 * страница выглядела как соседние.
 */
import { Renderer } from "@freelensapp/extensions";
import React, { useState } from "react";

import { type CliState, inspect, installCli, NAME, removeCli, supported, systemDirs } from "./cli";

const { Button, Notifications } = Renderer.Component;

/** Путь с `~` вместо домашнего каталога — короче и не светит имя пользователя на скриншоте. */
function tilde(file: string): string {
  const home = process.env.HOME;

  return home && file.startsWith(`${home}/`) ? `~${file.slice(home.length)}` : file;
}

function describe({ ours, foreign, target }: CliState): string {
  if (ours.length > 0) return `Installed: ${ours.map(tilde).join(", ")}`;

  if (foreign) return `Cannot install: ${tilde(foreign)} already exists and is not ours.`;

  if (target) return `Not installed. It will be put at ${tilde(target)}.`;

  return "Cannot install: none of ~/.local/bin, ~/bin, /opt/homebrew/bin, /usr/local/bin is on PATH and writable.";
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function CliInput() {
  // состояние файла живёт на диске, а не в React: перечитываем после каждого действия
  const [, rerender] = useState(0);

  if (!supported) return <p>The {NAME} command is a shell script and is not available on Windows.</p>;

  const state = inspect(systemDirs());
  const installed = state.ours.length > 0;

  const run = (action: () => string) => () => {
    try {
      Notifications.ok(action());
    } catch (error) {
      Notifications.error(`${NAME}: ${message(error)}`);
    }

    rerender((n) => n + 1);
  };

  return (
    <div className="flex column gaps">
      <p>{describe(state)}</p>
      <div className="flex gaps">
        <Button
          primary
          label={installed ? `Reinstall ${NAME}` : `Install ${NAME}`}
          disabled={!installed && (!!state.foreign || !state.target)}
          onClick={run(() => `${NAME} installed: ${tilde(installCli())}`)}
        />
        <Button
          label={`Remove ${NAME}`}
          disabled={!installed}
          onClick={run(() => `${NAME} removed: ${removeCli().map(tilde).join(", ")}`)}
        />
      </div>
    </div>
  );
}

export function CliHint() {
  return (
    <span>
      <code>{NAME}</code> colors your own logs in any terminal the same way: <code>kubectl logs -f pod | {NAME}</code>.
      Nothing is installed together with the extension; the command is removed when the extension is disabled or
      uninstalled, and comes back when it is enabled again.
    </span>
  );
}

/**
 * Регистрация для `appPreferences`. Хост не отдал React — страницы нет вовсе:
 * отрисовать её нечем, а раскраска логов от неё не зависит.
 */
export const preferences = React
  ? [
      {
        title: `Terminal command: ${NAME}`,
        id: "cli",
        components: { Input: CliInput, Hint: CliHint },
      },
    ]
  : [];
