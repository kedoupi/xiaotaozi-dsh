# Third-party notices

This plugin is a derivative of [`xmanrui/dsh-im`](https://github.com/xmanrui/dsh-im), licensed under the MIT License and copyright 2026 xmanrui. The TypeScript host/client layout is this catalog's. Channel behavior through 2.0.0 — inbound and result files, Feishu watches and group-response modes, Agent Preset, WhatsApp access modes, QQ Markdown, Telegram Rich Messages, Discord Public Threads, and Host English — is included, with selected reliability and product surfaces through 3.0.7 (WeChat iLink chunking, diagnostics, and typing; Feishu post commands and interactive `/m` menu; QQ markdown delivery; WeCom thinking/answer streams; `/compact` argument compatibility; workspace path entry; `/reasoning` `/batch` `/version`; multi-channel status reactions; structured last-message-error reporting; and loopback 403 recovery). Local usage-guide branding remains this catalog's.

The Weixin iLink request format, QR-login states, and message fields are adapted from Tencent's [`openclaw-weixin`](https://github.com/Tencent/openclaw-weixin) project at commit `cef0bfc390393f716903e16d50408118047f87e0` (package version 2.4.6), licensed under the MIT License and copyright Tencent.

The DingTalk device-authorization request sequence and AI Card streaming protocol are adapted from DingTalk Real Team's [`dingtalk-openclaw-connector`](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector) project at commit `b2fd6e5ea2ff99bd213faac637d3da541b2bfaf4`, licensed under the MIT License and copyright 2026 DingTalk Real Team.

The WeCom QR-authorization request sequence is adapted from the official [`@wecom/wecom-openclaw-cli`](https://www.npmjs.com/package/@wecom/wecom-openclaw-cli) 1.1.0 package, whose npm metadata declares the ISC License. No CLI source or OpenClaw runtime is bundled in this package.

Runtime dependencies include [`@larksuiteoapi/node-sdk`](https://github.com/larksuite/node-sdk) 1.73.0, [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys) 7.0.0-rc14, [`dingtalk-stream`](https://github.com/open-dingtalk/dingtalk-stream-sdk-nodejs) 2.1.4, [`@wecom/aibot-node-sdk`](https://github.com/WecomTeam/aibot-node-sdk) 1.0.7, [`@tencent-connect/qqbot-nodejs`](https://github.com/tencent-connect/qqbot) 1.0.4, [`qrcode`](https://github.com/soldair/node-qrcode) 1.5.4, [`https-proxy-agent`](https://github.com/TooTallNate/proxy-agents/tree/main/packages/https-proxy-agent) 5.0.1, and [`sharp`](https://github.com/lovell/sharp) 0.35.3. They stay external (`deps.neverBundle: true`) and are not copied into `lib/`. The Lark SDK, Baileys, and https-proxy-agent are licensed under the MIT License. sharp is Apache-2.0 and its platform libvips artifacts declare LGPL-3.0-or-later; their package metadata and license materials remain in the installed runtime tree. protobufjs (a Baileys dependency) is licensed under the BSD 3-Clause License; the Lark SDK and protobufjs license texts are reproduced below. `dingtalk-stream` is copyright 2023 钉钉开放平台团队.

QQ QR binding can optionally use Tencent Connect's [`@tencent-connect/qqbot-connector`](https://www.npmjs.com/package/@tencent-connect/qqbot-connector) 1.2.0 package. Its npm metadata declares `UNLICENSED`, so Xiaotaozi does not redistribute it in the desktop runtime. The QR feature stays unavailable unless an operator separately supplies that optional peer under terms they have independently accepted; manual AppID/AppSecret binding remains available. The connector is present only as a development dependency in this repository and no connector source is copied into this package.

The WhatsApp channel uses Baileys to implement WhatsApp Web linked-device QR login and messaging. This is an unofficial WhatsApp Web integration; users should use a dedicated bot number and understand that WhatsApp protocol changes can require connector updates.

This project is an independent DeepSeek Harness integration. It does not bundle OpenClaw and is not endorsed by Tencent, WeCom, Feishu, DingTalk, QQ, Telegram, Discord, Meta, or WhatsApp.

The WeChat, QQ, Telegram, Discord, and WhatsApp marks use path data published by Simple Icons under the CC0 1.0 Universal license. The Feishu, DingTalk, and WeCom marks are inline vectors used for channel identification. Product names and logos remain trademarks of their respective owners.

## Lark Node SDK license

MIT License

Copyright (c) 2022 Lark Technologies Pte. Ltd.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice, shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## protobufjs license

This license applies to all parts of protobuf.js except those files either explicitly including or referencing a different license or located in a directory containing a different LICENSE file.

Copyright (c) 2016, Daniel Wirtz  All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

- Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
- Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
- Neither the name of its author, nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE, ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Code generated by the command line utilities is owned by the owner of the input file used when generating it. This code is not standalone and requires a support library to be linked with it. This support library is itself covered by the above license.
