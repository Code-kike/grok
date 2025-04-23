# GrokProxy

## 为什么需要它

Grok API 的格式与 OpenAI API 不同，但有许多工具专为 OpenAI API 格式设计。本项目提供了一个可兼容 OpenAI 的个人端点，使您能够使用 Grok。

## 什么是无服务器？

虽然它运行在云端，但不需要服务器维护。它可以轻松部署到各种提供商（Vercel、Netlify、Cloudflare），并享受免费服务（个人使用的限额通常足够慷慨）。

## 如何开始

你需要一个个人的 Grok API 密钥。

使用以下说明将项目部署到任一提供商。你需要在提供商上设置一个账户。

### 使用 Vercel 部署

[![使用 Vercel 部署](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOURUSER%2Fgrokproxy)

* 或者可以通过 CLI 部署：`vercel deploy`
* 本地服务：`vercel dev`

### 部署到 Netlify

[![部署到 Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https%3A%2F%2Fgithub.com%2FYOURUSER%2Fgrokproxy)

* 或者可以通过 CLI 部署：`netlify deploy`
* 本地服务：`netlify dev`
* 提供两种不同的 API 基础路径：
  * `/v1`（例如 `/v1/chat/completions` 端点）
  * `/edge/v1`

### 部署到 Cloudflare（暂不可用）

* 可以通过 CLI 部署：`wrangler deploy`
* 本地服务：`wrangler dev`

### 本地运行 - 使用 Node, Deno, Bun

1. 对于 Node：`npm install`
2. 然后运行：`npm run start` / `npm run start:deno` / `npm run start:bun`

#### 开发模式（监视源代码变化）

1. 对于 Node：`npm install --include=dev`
2. 然后运行：`npm run dev` / `npm run dev:deno` / `npm run dev:bun`

## 如何使用

设置你的 API 基础 URL 为：`https://your-deployment-url.com/v1`

在你的应用程序中使用 Grok API 密钥作为 OpenAI API 密钥。

## 支持的 API 端点

* `/v1/chat/completions` - 聊天交互的主要端点
* `/v1/completions` - 基本文本补全
* `/v1/models` - 列出可用模型
* `/v1/embeddings` - 生成文本嵌入

## 模型

默认情况下，所有请求都将使用 Grok 模型。

## 环境变量

* `GROK_API_KEY` - 你的 Grok API 密钥（如果未在请求中提供）
* `GROK_API_BASE` - 可选的 Grok API 基础 URL 覆盖

## 许可证

MIT 
