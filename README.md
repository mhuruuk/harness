# Harness

Harness (`dsh`) — это open-source агентский каркас.

Он работает на [Cordis](https://github.com/cordiverse/cordis), чей дизайн описан в работе [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Документация: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

Перед запуском проекта ознакомьтесь с [примечанием о безопасности](SAFETY.md).

<a id="run"></a>

## Запуск

<a id="run-from-source"></a>

### Запуск из исходников

Чтобы запустить из клонированного репозитория:

```sh
git clone https://github.com/mhuruuk/harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` готовит артефакты репозитория. `pnpm dsh web` использует эти готовые артефакты без пересборки.

## Разработка

Начните с [руководства по разработке](docs/development.md) и [документации по архитектуре](docs/architecture.md).

Для агентов — следуйте [AGENTS.md](AGENTS.md).

## Лицензия

[MIT](LICENSE)

Третьесторонние зависимости и их лицензии раскрыты в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
