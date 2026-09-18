/**
 * Раскраска логов в штатном вьювере Freelens — обёртка над `PodApi.getLogs`.
 *
 * Точки расширения для логов в API нет, поэтому мы оборачиваем метод у того
 * самого экземпляра `PodApi`, через который вьювер и читает логи: встроенный
 * `call-for-logs.injectable` инжектит `podApiInjectable`, а `podsStore.api` —
 * это он же. Прокси из `Renderer.K8sApi.podsApi` для этого не годится: у него
 * нет ловушки `set`, присваивание ушло бы в пустой объект-цель.
 *
 * Отсюда и ограничения, о которых честно написано в README: экземпляр общий,
 * так что раскраску увидит и «Download all logs»; при переименовании метода в
 * апстриме обёртка просто перестанет ставиться (и скажет об этом в консоль).
 *
 * Сама раскраска — в `colorize.ts`, там же гарантия, что снятие ANSI вернёт
 * исходный текст.
 */
import { Renderer } from "@freelensapp/extensions";

import { colorizeLogs } from "./colorize";
import { enabled } from "./config";

type PodApi = Renderer.K8sApi.PodApi;
type GetLogs = PodApi["getLogs"];

/** Метка на экземпляре: второй раз оборачивать нельзя — цвет наложится дважды. */
const MARK = "__logsColorized";

type Marked = PodApi & { [MARK]?: boolean };

/**
 * Ставит обёртку. Зовётся один раз, при активации расширения.
 *
 * Обёртка ставится всегда, а `enabled()` спрашивается уже внутри неё: иначе
 * выключенное в момент старта расширение нельзя было бы включить правкой файла
 * — пришлось бы перезагружать окно.
 *
 * Свой кластерный фрейм — своя копия расширения и свой `podsStore`, поэтому
 * функция отрабатывает в каждом фрейме заново; метка на экземпляре не даёт
 * обернуть дважды один и тот же объект.
 */
export function installLogColors(): void {
  try {
    const api = Renderer.K8sApi.podsStore.api as Marked;

    if (api[MARK]) return;

    const original = api.getLogs.bind(api) as GetLogs;

    api.getLogs = ((params, query) =>
      original(params, query).then((logs) => (enabled() ? colorizeLogs(logs) : logs))) as GetLogs;

    api[MARK] = true;
    console.info("[logscolor] раскраска логов подключена");
  } catch (error) {
    // в корневом фрейме подового стора нет — это норма, а не поломка
    console.warn("[logscolor] не подключил раскраску логов:", error);
  }
}
