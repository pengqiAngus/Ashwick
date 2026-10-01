# Ashwick · 加密货币行情观察

深色、极简的加密货币价格观察工具：搜索币安 USDT 现货交易对、查看 K 线、收藏交易对并设置目标价格区间。个人使用，无账号系统；不包含交易、钱包、持仓或收益计算。

## 技术栈

Next.js 16（App Router，Turbopack）· TypeScript · Tailwind CSS 4 · shadcn/ui（Base UI）· Motion · TradingView Lightweight Charts 5 · PostgreSQL 16 + Prisma 7 · 币安现货公开行情接口 · Vercel AI SDK 7 + AI Elements（Agent 工作台）· Vitest。

## 页面

| 页面 | 路径 | 说明 |
|---|---|---|
| Home | `/` | 仅一个搜索框，搜索 USDT 现货交易对 |
| K线 | `/chart?symbol=BTCUSDT&interval=1h` | 默认 BTCUSDT，周期 15m / 1h / 4h / 1d / 1w，默认 1h；页面顶部有紧凑搜索框可直接切换交易对 |
| Favorite | `/favorites` | 收藏卡片、目标价格区间、进入区间高亮；卡片上的“AI 分析”按钮与右上角“打开 Agent”入口 |
| Agent | `/agent`、`/agent/[conversationId]` | 加密货币预测 Agent 聊天工作台（见下文） |

## 环境要求

- Node.js ≥ 20.9（本项目在 Node 25 上开发；Prisma 7 会对非 LTS 版本给出提示，可忽略）
- pnpm 11
- Docker Desktop（用于本地 PostgreSQL）；或自备 PostgreSQL 16 并填入 `DATABASE_URL`

## 安装与启动

```bash
pnpm install                 # 安装依赖，并自动执行 prisma generate
cp .env.example .env         # 按需修改
pnpm db:up                   # 启动 PostgreSQL（docker compose up -d）
pnpm db:migrate              # 执行数据库迁移（prisma migrate deploy）
pnpm dev                     # http://localhost:3000
```

停止数据库：`pnpm db:down`（数据保存在 Docker volume `ashwick_pgdata` 中）。

### 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `DATABASE_URL` | `postgresql://record:record@localhost:5432/ashwick?schema=public` | 与 `docker-compose.yml` 一致 |
| `BINANCE_API_BASE_URL` | `https://api.binance.com` | 可换为 `https://data-api.binance.vision`（仅公开行情） |
| `SYMBOLS_CACHE_TTL_MS` | `3600000` | 交易对信息缓存时长 |
| `NEXT_PUBLIC_QUOTE_REFRESH_MS` | `3000` | 报价与 24 小时行情刷新间隔（最小 1000） |
| `NEXT_PUBLIC_QUOTE_STALE_MS` | `60000` | 超过该时长未刷新成功即标记“行情已过期” |
| `AI_PROVIDER_BASE_URL` / `AI_PROVIDER_API_KEY` | — | OpenAI 兼容模型服务地址与密钥，仅服务端读取；未配置时 Agent 页面可打开，但分析返回“模型服务未配置” |
| `AI_MODEL_ANALYST` / `AI_MODEL_SYNTH` | — | 角色 Agent 与汇总 / 叙述使用的模型名 |
| `AI_STRUCTURED_OUTPUT_MODE` | `json_schema` | `json_schema` / `json_object` / `prompt`；网关拒绝 `response_format` 时自动降级为 `prompt`。旧变量 `AI_SUPPORTS_STRUCTURED_OUTPUTS="false"` 等同 `prompt` |
| `AGENT_MAX_OUTPUT_TOKENS` | `4096` | 单次模型调用输出上限；输出被截断时会自动放大 1.5 倍重试一次 |
| `AI_EXTRA_BODY` | 空 | 透传到模型请求体的 JSON，例如豆包 `{"thinking":{"type":"disabled"}}` |
| `AGENT_MAX_RUN_MS` / `AGENT_MAX_MODEL_CALLS` / `AGENT_DEBATE_ROUNDS` / `AGENT_MAX_INPUT_CHARS` / `AGENT_RISK_MODE` | `240000` / `14` / `1` / `4000` / `fast` | 单次运行预算与流程配置，详见 `.env.example` |

## 生产部署

```bash
pnpm build          # prisma generate && next build
pnpm db:migrate     # 目标数据库执行迁移
pnpm start
```

- 需要 Node.js 运行环境（API 路由使用 `nodejs` runtime，不支持 Edge）。
- **上线前务必在部署环境验证币安接口可达性**：`curl https://api.binance.com/api/v3/ping`。部分地区/云厂商会返回 HTTP 451 或被 WAF 拦截；本项目不会静默切换数据源或展示假数据，只会在页面上给出明确错误。
- 若使用 Vercel 等平台，请在平台环境变量中配置上表内容，并使用托管 PostgreSQL 的连接串。

## 数据口径说明

- 观察对象为币安现货中**状态为 TRADING、允许现货交易、报价资产为 USDT** 的交易对；价格与目标区间均以 USDT 计价。
- “24 小时涨跌”来自 `/api/v3/ticker/24hr` 的滚动 24 小时窗口，是行情涨跌，不是个人收益，也不是“今日”涨跌。
- 币安公开接口不提供市值与 Token 图标，本版**不展示市值**（见“待确认需求”），图标统一用字母标识。
- 搜索匹配 `baseAsset` 与 `symbol`（精确 > 前缀 > 包含，最多 10 条），不支持中文名或项目全称搜索。
- 目标区间命中条件：`下限 ≤ 最新价 ≤ 上限`，使用精确十进制比较（decimal.js / Postgres `DECIMAL(38,18)`），不依赖四舍五入后的展示价格；报价过期或不可用时不判定命中。命中仅表示“当前处于区间内”，不记录历史触达，不发送通知。

## 接口与刷新策略

| 本站接口 | 币安接口 | 说明 |
|---|---|---|
| `GET /api/symbols/search?q=` | `exchangeInfo`（权重 20，服务端缓存 1 小时） | 搜索 |
| `GET /api/symbols/:symbol` | 同上 | 校验交易对，返回价格精度 |
| `GET /api/klines?symbol&interval&limit` | `klines`（权重 2） | 首屏 500 根，增量 2 根 |
| `GET /api/tickers?symbols=A,B` | `ticker/24hr`（≤20 个/批，权重 2/批） | 收藏页一次请求覆盖全部卡片 |
| `GET/POST /api/favorites`、`DELETE /api/favorites/:symbol`、`PUT /api/favorites/:symbol/target` | — | 收藏与目标区间，服务端二次校验 |

- 报价默认每 3 秒刷新；K 线增量刷新按周期 10–30 秒；页面隐藏时暂停，重新可见后立即刷新。
- 请求不重叠；遇 429/418 会读取 `Retry-After` 并在本进程内暂停请求币安，前端按提示延后重试，不做无限重试。
- 所有错误（限流、超时、451、无效交易对、数据库未启动）均以统一 JSON 返回并在界面上以中文提示。

## Agent 聊天工作台

### 能力范围（已实现）

- **两个入口共用一套流程**：`/agent` 手动输入；收藏卡片“AI 分析”按服务端数据库中**已保存**的目标区间生成首条用户消息（不使用输入框草稿），跳转后由会话页通过明确的 `POST /api/agent/chat` 启动，且只启动一次。
- **幂等与并发**：`launchId` 唯一键去重首条消息；`(conversationId, clientMessageId)` 去重手动消息；`Conversation.activeRunId` 租约 + 条件更新保证每会话只有一个活跃运行；重复请求返回 409 并由客户端切换为轮询已有运行；心跳过期的运行会被回收为失败并允许重试。刷新、后退、双击、Strict Mode、多标签均不会重复分析。
- **真实行情与量化层**（`src/lib/market`、`src/lib/quant`）：只使用 cutoff 之前**已收盘**的 K 线（含成交量、成交额、笔数、收盘时间），分页拉取、去重排序、缺口 / 过期 / 预热检查；EMA、RSI、MACD、ATR、布林带、收益率、实现波动率、成交量变化；摆动点聚类支撑阻力（带触碰次数与来源 K 线）；规则化市场状态与多周期一致性。
- **多 Agent 服务端编排**（`src/lib/agent/orchestrator.ts`）：交易对确认 → 数据获取 → 质量检查 → 特征计算 → 量化预测 → 技术分析 / 市场状态 / 多头 / 空头 / 研究汇总 / 交易情景 / 风险评估（fast 单节点或 deep 三角色）→ 确定性校验 → 最终报告。模型只能引用已计算的证据 id；情景价格只能引用支撑阻力 id，服务端解析成价格；校验失败的情景被剔除。
- **追问意图路由**：解释 / 假设情景 / 刷新 / 改周期 / 换交易对 / 澄清；规则优先，模糊时调用模型。解释与假设只读取历史报告并注明数据截止时间，不重新拉取行情；刷新 / 改周期 / 换交易对创建新运行，旧报告保留。
- **真实中间状态**：步骤、工具输入输出、快照、报告以 AI SDK 类型化 data parts（稳定 id 原地更新）流式下发，同一事件同时写入 `AnalysisStep` / `AnalysisReport` / `Message.parts`，刷新后从数据库恢复并渲染一致。客户端断开不等于停止；“停止”会把运行置为 `cancelling` 并中止模型与行情请求。
- **量化预测**：阶段 4 未实现，`predict()` 始终返回 `status: unavailable`、`modelVersion: null`、概率与预期收益为 `null`；界面显示“仅技术分析”。

### 未接入 / 不做

新闻、社交情绪、链上数据、资金费率、持仓量未接入，报告中标记 `unsupported`；不连接交易账户、不下单、不输出仓位建议；未建立路径模型，因此不给出目标区间“触达概率”，只做情景说明。

### 接口

| 接口 | 说明 |
|---|---|
| `POST /api/agent/conversations` | 创建会话与首条待运行消息（`source: favorite_card | manual`，`launchId` 幂等）；不启动分析 |
| `GET /api/agent/conversations/:id` | 读取会话、消息、活跃运行、待启动 / 可重试消息 |
| `POST /api/agent/chat` | `{ conversationId, pendingMessageId }` 启动待处理消息，或 `{ conversationId, message }` 发送新消息；返回 UI message stream，`x-run-id` 头；冲突 409 |
| `GET /api/agent/runs/:runId` | 只读运行状态、步骤、报告、assistant 消息 |
| `POST /api/agent/runs/:runId/cancel` | 停止运行（幂等） |

### 运行与测试

```bash
pnpm db:up && pnpm db:migrate     # 含 agent_workbench 迁移
pnpm typecheck
pnpm test                         # Vitest：指标、时间边界、快照、意图路由、报告校验、parts 合成；有 DATABASE_URL 时还运行 claim / 终态 / 取消 / 孤儿回收的数据库集成测试
pnpm build
```

手动验收清单见 `docs/agent-acceptance.md`。

## 手动验收步骤

1. **启动**：`pnpm db:up && pnpm db:migrate && pnpm dev`，打开 http://localhost:3000。
2. **Home**：主体只有搜索框。输入 `btc` → 出现 BTCUSDT、WBTCUSDT 等 ≤10 条；输入 `zzzz` → “没有匹配”；快速连续输入不出现旧结果错乱。↑/↓ 移动高亮，Enter 打开 K 线，Esc 与点击外部关闭下拉；下拉出现不影响搜索框位置。
3. **导航**：Header 三个入口在所有页面一致，当前页有平滑移动的激活指示；点击“K线”默认打开 BTCUSDT；手机宽度下三个入口仍直接可见。
4. **K 线**：`/chart` 与 `/chart?symbol=btcusdt` 均显示 BTCUSDT；`/chart?symbol=FAKE` 显示“不支持的交易对”与返回入口，不会替换成 BTC。切换 15m/1h/4h/1d/1w 时旧数据被清空、不闪烁旧周期；快速连续切换不会显示错误周期的数据。图表可缩放、拖动、有十字光标，右下角有 TradingView 标识；打开 SHIBUSDT 价格轴显示 8 位小数。刷新页面 URL 中的 symbol/interval 保留。页面顶部搜索框输入 `eth` 并回车 → 切换到 ETHUSDT，搜索框清空。
5. **收藏**：在 K 线页点击“收藏”→ 变为“已收藏”，刷新后仍为“已收藏”；再次点击取消。快速双击不会产生重复请求（按钮在请求期间禁用）。
6. **Favorite**：卡片显示交易对、最新价、24 小时涨跌、更新时间。设置区间：只填一个值 → 提示“请同时填写”；下限 > 上限 → 提示；`0`/`abc` → 提示；填入包含当前价的区间（例如当前价 ±1%）→ 保存后卡片边框/背景变为强调色并出现“已进入目标区间”；改为不含当前价的区间 → 高亮消失。边界：下限或上限恰好等于当前价视为命中；上下限相等允许保存。清空两项并保存 → 区间移除。修改输入但未保存时，高亮仍以已保存区间判断。刷新页面后已保存值保留。输入框与保存按钮不会跳转页面。
7. **过期与错误**：把 `.env` 的 `BINANCE_API_BASE_URL` 改成无效地址并重启 → 各页面显示明确错误，无假数据；恢复后正常。切到其他标签页 ≥1 分钟再切回 → 期间无网络请求，切回后立即刷新；若刷新失败，卡片显示“行情已过期”，且不再宣称命中。
8. **数据库**：停止 Docker 后访问 Favorite 页 → 显示“数据库暂时不可用”提示而非崩溃。
9. **响应式**：375px 宽度下无横向滚动条，图表、输入框、导航均可操作；开启系统“减少动态效果”后无位移动画。

## 待确认需求（本版未实现）

- **市值**：币安现货接口不提供，需要额外数据源（如 CoinGecko）及 baseAsset → 数据源 ID 的映射；本版不展示。
- **多用户 / 登录**：当前为个人使用，收藏与目标区间为全局单份数据。若需多用户，需引入认证并按用户隔离数据。
- **部署地区可用性**：币安接口在部分地区不可访问，需在实际部署环境验证。
- **通知 / 历史触达记录**：本版仅显示“当前是否处于区间”。
- **量化预测模型（阶段 4）**：方向分类 / 收益率回归 baseline、时间序列训练与样本外评估、概率校准、历史回放，尚未实现；当前所有预测字段为不可用状态。

## 版权

图表由 [TradingView Lightweight Charts™](https://www.tradingview.com/) 提供（Apache-2.0）。Copyright (с) 2025 TradingView, Inc. 页面页脚与图表内均保留了 attribution。
