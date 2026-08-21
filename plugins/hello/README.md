# dsh-hello

Host-only 脚手架金丝雀，不是产品插件。用来确认 `pnpm new` 的 host 模板仍能构建、测试、挂上 profile。

样例工具是 `hello`（问候）。不要在这里加功能；新产品走 `pnpm new <slug>`。

## Install

```bash
dsh plugin --profile <name> add ./plugins/hello
```

## Config

| Field | Default | Meaning |
| --- | --- | --- |
| `greeting` | `Hello` | Prefix used by the `hello` tool |
