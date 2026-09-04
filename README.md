# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) — это open-source агентский каркас (agent harness), разработанный [DeepSeek AI](https://deepseek.com).

Он построен на архитектуре **всё — это плагин** (everything-is-a-plugin) и работает на [Cordis](https://github.com/cordiverse/cordis), чей дизайн описан в работе [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Документация: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Предпросмотр для разработчиков

DeepSeek Harness находится в фазе _developer preview_ и быстро развивается. **ВНЕСУТСЯ ИЗМЕНЕНИЯ, ЛОМАЮЩИЕ СОВМЕСТИМОСТЬ.**

Перед запуском проекта ознакомьтесь с [примечанием о безопасности](SAFETY.md).

<a id="run"></a>

## Запуск

### Запуск из `npm`

Установите `Node.js`, затем выполните:

```sh
npx @deepseek-ai/dsh web
```

По умолчанию команда запускает Web UI на `http://127.0.0.1:3080` и при локальном запуске открывает его в браузере по умолчанию. При запуске через SSH выводится только URL хоста, потому что локальный перенаправленный адрес принадлежит SSH-клиенту или редактору. Передайте `--no-open`, чтобы запустить сервер без открытия браузера. Подробности — в [руководстве по Web UI](docs/user/guide/index.md).

<a id="run-from-source"></a>

### Запуск из исходников

Чтобы запустить из клонированного репозитория:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` готовит артефакты репозитория. `pnpm dsh web` использует эти готовые артефакты без пересборки.

## Сообщество и поддержка

- Отправляйте обратную связь и сообщения об ошибках через [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Добавьте тег [`dsh-plugin`](https://github.com/topics/dsh-plugin) в репозиторий вашего плагина, чтобы его было проще найти.
- Присоединяйтесь к <a href="https://discord.gg/Ycq5dCaS4">сообществу DeepSeek Harness в Discord</a>.

## Вклад

См. [CONTRIBUTING.md](CONTRIBUTING.md).

## Разработка

Начните с [руководства по разработке](docs/development.md) и [документации по архитектуре](docs/architecture.md).

Для агентов — следуйте [AGENTS.md](AGENTS.md).

## Лицензия

[MIT](LICENSE)

Третьесторонние зависимости и их лицензии раскрыты в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
