/**
 * Страница расширения в Preferences → Extensions: кнопки «поставить» и
 * «убрать» для команды `lc` (сама установка — в `cli.ts`, те же действия есть
 * в палитре команд — `commands.ts`).
 *
 * React свой не везём: Freelens 1.x и Lens 6.x кладут свой на
 * `globalThis.React` рядом с `LensExtensions`, и компоненты должны работать
 * именно с ним — второй экземпляр React в одном дереве ломает хуки. Поэтому
 * `react` в сборке подменяется глобалом (см. `vite.config.mjs`), а отсюда
 * берутся только типы. Кнопки — хостовые, из `Renderer.Component`, чтобы
 * страница выглядела как соседние.
 *
 * Этот файл — второе место, где ветки расходятся: в `v2` страница без React,
 * одним текстом, потому что ванильный Freelens 2.x React расширениям не отдаёт.
 */
import { Renderer } from "@freelensapp/extensions";
import React, { useState } from "react";

import { install, notify, uninstall } from "./commands";
import { describe, inspect, NAME, supported, systemDirs } from "./cli";

export function CliInput() {
  const { Button } = Renderer.Component;
  // состояние файла живёт на диске, а не в React: перечитываем после каждого действия
  const [, rerender] = useState(0);

  if (!supported) return <p>The {NAME} command is a shell script and is not available on Windows.</p>;

  const state = inspect(systemDirs());
  const installed = state.ours.length > 0;

  const run = (action: () => string) => () => {
    notify(action);
    rerender((n) => n + 1);
  };

  return (
    <div className="flex column gaps">
      <p>{describe(state)}</p>
      <div className="flex gaps">
        <Button
          primary
          label={installed ? `Reinstall ${NAME}` : `Install ${NAME}`}
          disabled={!installed && (!!state.foreign || !state.target || !state.node)}
          onClick={run(install)}
        />
        <Button label={`Remove ${NAME}`} disabled={!installed} onClick={run(uninstall)} />
      </div>
    </div>
  );
}

export function CliHint() {
  return (
    <span>
      <code>{NAME}</code> colors your own logs in any terminal the same way: <code>kubectl logs -f pod | {NAME}</code>.
      It needs <code>node</code> on PATH. Nothing is installed together with the extension; the command is removed when
      the extension is disabled or uninstalled, and comes back when it is enabled again. The same actions are in the
      command palette.
    </span>
  );
}

/**
 * Регистрация для `appPreferences`. Хост не отдал React — страницы нет вовсе:
 * отрисовать её нечем, а поставить `lc` можно и из палитры команд.
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
