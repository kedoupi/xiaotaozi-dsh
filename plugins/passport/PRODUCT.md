# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: a person sitting at their own machine, using DeepSeek Harness to write or debug code. Their job is to connect the models they already pay for (membership or API key) and then pick those models in chat.

Secondary: someone setting Harness up for colleagues. Same job, same screen; they are not a separate product.

## Product Purpose

Passport occupies Settings → 模型. One page connects official memberships and API keys, then lets the user choose which of that vendor's models appear in the conversation picker.

Success is: a usable model is connected, the picker only shows what they chose, and they never have to use the host's official Models page.

## Positioning

This is a membership-and-key wallet for Harness, not another API-key form. Subscriptions log in through the vendor's official OAuth or device-code flow; keys sit in the same list. The host Models page is unused on purpose.

## Operating Context

Runs inside `dsh web` as a mixed plugin (host + client). Tokens live in `~/.dsh/plugins/passport/auth.json` (mode 0600). Device-code and OAuth links can be copied and finished on another device; they do not have to complete in this browser.

Adding a vendor: sidebar shows only connected ones; the rest are behind 添加服务商. Custom vendors are OpenAI-compatible endpoints declared into `llm-pi-ai`.

## Capabilities and Constraints

Confirmed:

- User-facing copy is Chinese only. Do not show English or raw HTTP codes to the user.
- Subscriptions and API keys share one 模型 page.
- Do not copy, rename, or depend on the host Models UI. Official nav occupancy is a product decision, not a visual one. Hiding the official cell (`hide-official.ts`) scrapes host class names; that coupling is known and not a stable API.
- Live subscriptions today: 通义灵码 and Kimi 编程 (device code); ChatGPT Codex, Claude, Grok (OAuth). Other CN memberships may be listed as not ready.
- API keys use the host credential seam. Saved keys display as a mask, never the secret.
- Connected vendors expose a model checklist that feeds the conversation picker.
- Do not vendor or edit `deepseek-harness` in this repo.

Undecided:

- Whether more CN memberships (智谱 / 豆包 / 讯飞 / 混元) ship as official login next, or stay API-only.

## Brand Commitments

Package name `dsh-passport`. In the product the page is 模型, not 通行证 or 会籍. Group labels: 订阅, 密钥, 自定义.

Voice: short, operational Chinese. Explain the next action, not the protocol.

## Evidence on Hand

- Plugin copy and flows: `plugins/passport/src/client/locales.ts`, `ModelsWorkspace.tsx`
- Subscription catalog: `plugins/passport/src/catalog.ts`
- README: `plugins/passport/README.md`
- No customer quotes, screenshots for marketing, or third-party testimonials. Do not invent them.

## Product Principles

1. One 模型 page is the whole job: connect, then choose models.
2. Speak as the person in front of the machine, not as the OAuth spec.
3. A secret that has been saved must not reappear as text.
4. Authorization can leave this computer; the page must still make the next step obvious.
5. The host Models page is not a fallback and not a reference implementation.

## Accessibility & Inclusion

No extra legal or WCAG target was set. Keyboard use and screen-reader use of the settings dialog still matter because the page lives inside the host settings overlay.
