# 凭证获取与安全交付指南

> 项目：微信小程序「你的回声谷」 · 配套 `SMS_PNVS_DEPLOY.md` 的 B 阶段
> 目标：让 AI 助手代执行「配环境变量 / 部署云函数 / 跑 initDB / 设集合权限」，同时不泄露账号密钥
> 本文不含任何真实密钥。所有密钥只写入本机 `C:\Users\huawei\WorkBuddy\2026-11-04-17-36-01\secrets\wechat-im.env`

---

## 〇、先纠正上一轮的一个结论（重要）

上一轮说「给我腾讯云 SecretId/Key + 环境 ID」。核实腾讯云开发 CloudBase 官方文档后，**这个建议要改**：

| 项 | 上一轮说法 | 核实后的结论 |
|---|---|---|
| 腾讯云侧 | 给账号级 SecretId/Key | **不需要给任何密钥**。`tcb login` 设备码流程是官方为「AI 助手 / 远程环境」推荐的方式：我执行命令 → 打印授权链接 + 用户码 → 你在浏览器点确认 → 我这边自动拿到**临时凭证**（有过期时间，可 `tcb logout` 立即吊销） |
| 账号级密钥风险 | 未强调 | 官方原文警告：「账号级密钥可操作该账号下**所有**腾讯云资源」。而且你的云开发很可能**根本不在** UIN 100046171185 那个账号下（见第一节），给错账号等于给了也用不了 |
| 真正必须落盘的 | 两边都要 | 只有 **阿里云 AK/SK** —— 因为云函数运行时要拿它去调阿里云发短信，没有 OAuth 替代方案 |

所以最终要交给我的只有两类东西：**一次浏览器点确认**（腾讯云授权）+ **一个本地 env 文件**（阿里云 AK/SK 等）。

---

## 一、最容易踩的坑：云开发账号 ≠ 你的服务器账号

微信官方文档原文：**小程序首次开通云开发时，系统会自动为该小程序创建一个腾讯云账号并完成绑定**，复用小程序主体的实名信息。一个腾讯云账号同时只能绑定一个小程序。

也就是说：

- 你记忆里那个 Root 账号（UIN `100046171185`，轻量应用服务器 `192.144.229.63`、`weilaidexin.cn`）**是另一套账号**；
- 「你的回声谷」小程序云开发环境，很可能挂在**自动创建的另一个腾讯云账号**下；
- 用主账号登录 `https://console.cloud.tencent.com/tcb` 会看到环境列表为空，不是没开通，是**登错账号了**。

**正确入口**：打开腾讯云控制台登录页 → 登录方式选 **「小程序公众号」** → 微信扫码 → 在列表里选「你的回声谷」小程序 → 进入后才是这套云开发资源。

> CloudBase 官方 FAQ 也明确建议：AI 工具接入时用「小程序 / 公众号」方式登录，不要用腾讯云主账号，否则会出现权限与环境错配。

**检查点 ①**：用「小程序公众号」方式登录后，能在 `console.cloud.tencent.com/tcb` 看到至少一个环境，且环境 ID 与项目能对上。这一步不通，后面全部不用做。

---

## 二、环境 ID 在哪里找（三个入口，任选一个）

| 入口 | 逐屏路径 | 备注 |
|---|---|---|
| 微信开发者工具（推荐） | 打开项目 → 顶部工具栏点 **「云开发」** → 云开发控制台右上角 **设置（齿轮）** → **环境设置** / 「环境变量」标签页 → 看到「环境名称」和「环境 ID」 | 最可靠，登的就是小程序本体 |
| 腾讯云控制台 | `https://console.cloud.tencent.com/tcb` → 左侧选环境 → **概览**页 → 环境 ID | 必须先用「小程序公众号」方式登录 |
| 命令行 | 我登录成功后执行 `tcb env list`，会自动列出该账号下所有环境 ID | **其实你不用抄**，授权登录后我自己读 |

### ⚠️ 项目里有两个互相矛盾的环境 ID

| 出处 | 值 |
|---|---|
| `app.js:7` `globalData.cloudEnv` | `cloud1-d3gh3da2m2b1bafeb`（注释还写着「请替换为你的云开发环境ID」） |
| `SUCCESS_TIM_LOGIN.md:89` | `cloud1-9g55gy2x541c7f64` |

**必须以控制台里实际在用的那个为准**。填错环境 ID 会把云函数部署到一个没人用的空环境，然后你会以为「部署成功但登录没反应」。

---

## 三、腾讯云授权：三种方式，推荐第 1 种

| 方式 | 要给我密钥吗 | 权限范围 | 适用 |
|---|---|---|---|
| **A. 设备码登录（推荐）** | **完全不用** | 临时凭证，随登录会话过期，可随时吊销 | 本次一次性部署；最安全 |
| B. 环境级 API Key | 给一个 Key + 环境 ID | **仅限单个环境**，官方称「适合按环境隔离」 | 不想每次点授权、或需要长期自动化 |
| C. 账号级 CAM 子账号 SecretId/Key | 给 SecretId + SecretKey | 受 CAM 策略约束，但仍是账号级永久密钥 | 不推荐，仅兜底 |

### A. 设备码登录（我需要你配合的只有一次点击）

我这边执行：

```bash
tcb login
```

终端会打印一个**授权链接**和一个**用户码**（形如 `ABCD-EFGH`）。你把链接在浏览器打开、输入用户码、点「确认授权」。浏览器登录时选 **「小程序公众号」** 方式扫码。我这边轮询到确认后自动保存临时凭证，随后用 `tcb env list` 验证。

- 不需要本地回调端口，不需要把密钥发给我，也不需要你在聊天里贴任何东西。
- 用完执行 `tcb logout` 即可清掉本机凭证。
- 凭证存在 `~/.config/.cloudbase/auth.json`，**不要提交、不要分享**。

### B. 环境级 API Key（可选）

- 控制台：云开发控制台 → 环境设置 → **API Key** → 创建；Key 明文**只在创建时返回一次**。
- 或登录后我用 CLI 创建（可设有效期，最短 7200 秒）：
  `tcb env apikey create echo-valley-agent -e <envId> --expire 86400`
- 我用它登录：`tcb login --cloudbase-api-key <key> -e <envId>`
- 用完吊销：`tcb env apikey delete`

### C. 账号级密钥（不推荐，但你问了「在哪找」，路径给全）

1. **先建子账号，不要动主账号密钥**：`https://console.cloud.tencent.com/cam` → 用户 → 用户列表 → **新建用户** → 自定义创建 → 访问方式勾 **「编程访问」**（可同时勾控制台访问）→ 完成。
2. **授权**：子账号详情 → 权限 → 关联策略，选 `QcloudAccessForTCBRole`（云开发访问云资源）。若该子账号还要用网页授权登录 CLI，再补 `QcloudCamReadOnlyAccess`。
3. **建密钥**：`https://console.cloud.tencent.com/cam/capi`（访问管理 → API 密钥管理），或子账号详情 → **API 密钥** → 新建密钥。
4. **SecretKey 只在创建弹窗里显示一次** —— 腾讯云自 2023-11-30 起关闭了 SecretKey 查询功能，只能看 SecretId。当场复制保存，关掉就再也找不回来，只能删掉重建。
5. 每个账号最多 2 个密钥。

> 官方对 `--apiKeyId/--apiKey` 登录的原话是「永久密钥仅用于 CI 部署，不要在开发者本地使用」，本地开发应遵循最小权限、用 `tcb login` 拿临时密钥。

---

## 四、阿里云 RAM 子账号 AK/SK（★ 真正要落盘的）

### 4.0 先别急着新建 —— 项目里很可能已经有一套现成的

`cloudfunctions/alicloudSecCheck/index.js:15-16` 已经在读：

```
process.env.ALIBABA_CLOUD_ACCESS_KEY_ID
process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET
```

这是内容审核用的 AK。交接单也写了「复用已有环境变量」。**先去查它是否已配置**：

微信开发者工具 → 云开发 → **云函数** → 找到 `alicloudSecCheck` → **版本详情** → **配置** → 拉到最下面 **环境变量**。环境变量值是明文可见的（截图时请把值打码）。

- **如果这两项已存在**：不用新建 RAM 用户、不用抄 AK/SK、不用贴聊天。
  - 只需在阿里云 RAM 控制台给**那个 RAM 用户**补挂 `AliyunDypnsFullAccess` 策略；
  - 我登录云开发后，用 `@cloudbase/manager-node` 把这套环境变量**直接复制**到 `sendSmsCode` 和 `phoneLogin`，密钥全程不经过聊天窗口、不落到本地文件。
  - 在 env 文件里把 `REUSE_EXISTING_ALIYUN_AK` 改成 `true` 即可。
- **如果不存在**：按 4.1 新建。

> 注意：云函数环境变量是**按函数独立配置**的，`alicloudSecCheck` 有，不代表两个新函数自动有 —— 所以才需要「复制」这一步。

### 4.1 新建 RAM 子账号（逐屏操作）

1. 用**阿里云主账号**（已企业认证、有营业执照的那个）登录 `https://ram.console.aliyun.com/users`
2. 左侧 **身份管理 → 用户 → 创建用户**
   - **登录名称**：`echo-valley-sms`（只能用英文字母、数字、`.` `-` `_`）
   - **显示名称**：`你的回声谷-短信`
   - **访问方式**：**只勾「使用永久 AccessKey 访问」**。这是给程序用的身份，按官方建议「人员用户与应用程序用户分离」，**不要勾控制台访问**。
   - 确定 → 按提示完成手机验证码安全验证。
3. 用户列表 → 点开刚建的用户 → **认证管理**页签 → **AccessKey** 区域 → **创建 AccessKey**
   - 阅读使用场景提示 → 勾选「我确认必须创建 AccessKey」→ 继续创建 → 完成安全验证
4. **立刻保存**：弹窗里点 **「下载 CSV 文件」** 或复制 `AccessKey ID` + `AccessKey Secret`。
   > ⚠️ **AccessKey Secret 只在创建时显示，不支持查询**。关掉弹窗就永久找不回来，只能重新创建（一个 RAM 用户最多 2 个 AK）。
5. **授权**：用户列表 → 该用户「添加权限」
   - 授权范围：**整个云账号**
   - 选择权限策略 → **系统策略** → 搜索 `dypns` → 勾选 **`AliyunDypnsFullAccess`**（号码认证服务完全访问）→ 确定
   - 方案 B（传统短信服务）报备通过后，再补一条短信服务的完全访问策略（搜索 `dysms`，以控制台实际显示名称为准）。现在不用加。
6. **不要配置「AccessKey 网络访问限制 / IP 白名单」**。
   > 这是唯一要「反着做」的安全建议：创建页会推荐你配来源 IP。但本 AK 是给**云函数**用的，云函数跑在腾讯云侧、出口 IP 不固定，一旦配了白名单，`SendSmsVerifyCode` / `CheckSmsVerifyCode` 会全部鉴权失败。
7. **禁止使用主账号 AK**（官方明确：主账号 AK 泄露会威胁账号下所有资源）。

### 4.2 顺手还要拿两样（不是密钥，但要给我）

| 项 | 位置 |
|---|---|
| PNVS **系统赠送签名名称** | `https://dypns.console.aliyun.com/smsCertParamsConfig/sign` |
| PNVS **赠送模板 CODE** | `https://dypns.console.aliyun.com/smsCertParamsConfig/template` |

两者必须配套使用、不可自定义。模板内容里的变量名要看清，若不是 `code` / `min`，需同步调整 `ALIYUN_PNVS_TEMPLATE_PARAM`（必须保留 `##code##`）。

---

## 五、怎么把信息交给我（唯一正确姿势）

**一句话：写本地文件 → 告诉我「填好了」→ 我自己去读。不要在聊天里贴任何密钥。**

原因：聊天内容会同步留存、可能被截图或转发；而本地文件在 git 仓库之外，不会被提交。

### 已经为你准备好的文件

```
C:\Users\huawei\WorkBuddy\2026-11-04-17-36-01\secrets\wechat-im.env
```

用记事本或 VS Code 打开，把 `<...>` 占位符替换成真值，保存。然后在聊天里只回一句「填好了」。我会自己读文件，且不会把密钥内容回显到对话里。

### ⚠️ 绝对不要把这个文件放进项目目录

你的 `~/.bashrc` 里 `git()` 包装会 **自动 `add -A` → 有改动就 auto commit → push**。只要文件出现在 `d:\原C盘\桌面\wechat-im\` 里，下次 push 就会把 AK/SK 推到 GitHub 上，且历史记录里删不干净。

已做的双保险：项目 `.gitignore` 增加了 `.env` / `.env.*` / `*.env` / `*.secrets.env` / `/secrets/` / `/.secrets/` / `cloudbaserc.local.json` 忽略规则。但**仓库外才是真安全**，别依赖 `.gitignore`。

### 交付清单（最少只要 3 项）

| 项 | 是否必须 | 从哪来 |
|---|---|---|
| `CLOUDBASE_ENV_ID` | 建议填（我登录后也能自己列） | 第二节 |
| `REUSE_EXISTING_ALIYUN_AK=true` 或 `ALIBABA_CLOUD_ACCESS_KEY_ID/SECRET` | **必须二选一** | 第四节 |
| `ALIYUN_PNVS_SIGN_NAME` + `ALIYUN_PNVS_TEMPLATE_CODE` | **必须** | 4.2 |
| 腾讯云 `CLOUDBASE_API_KEY` / SecretId/Key | **可全部留空** | 走设备码登录 |

---

## 六、我拿到之后会自动做什么

1. `tcb login`（设备码，你点一次确认）→ `tcb env list` 核实真实环境 ID。
2. 若 `REUSE_EXISTING_ALIYUN_AK=true`：读 `alicloudSecCheck` 的环境变量 → 复制到 `sendSmsCode` / `phoneLogin`；否则用 env 文件里的 AK/SK。
3. 按 `sms-env.example.json` 配齐 `SMS_PROVIDER=pnvs`、赠送签名/模板、`SMS_DEV_MODE` 等（**两个函数都要配 AK/SK**，因为 `CheckSmsVerifyCode` 在 `phoneLogin` 里执行）。
4. 部署两个云函数（**云端安装依赖**）→ 云端调一次 `initDB` → 把 `sms_codes` / `sms_send_log` 权限设为「仅管理端可读写」。
5. 临时关掉 `getUserSig` 的开放时间门禁（`adminConfig` action=`save`）后跑通联调，输出自检报告。
6. 交还给你：关 `SMS_DEV_MODE` → 真机收短信 → 截三张图 → 提交腾讯营销审核。

---

## 七、现在只做第 1 步

按你习惯的节奏，一次只做一步，做完截图给我，我确认后再给下一步。

**第 1 步 = 两个体检项（不需要创建任何东西、不需要给任何密钥）：**

1. 用**「小程序公众号」方式**扫码登录腾讯云控制台，打开 `https://console.cloud.tencent.com/tcb`，截图环境列表（确认能看到环境、记下环境 ID）。
2. 微信开发者工具 → 云开发 → 云函数 → `alicloudSecCheck` → 版本详情 → 配置 → 环境变量，**截图看有没有 `ALIBABA_CLOUD_ACCESS_KEY_ID` / `..._SECRET` 两行**（值请打码，我只要知道「有 / 没有」）。

这两张截图决定后面走哪条路：

- 有现成 AK → 阿里云侧只补一条授权策略，env 文件里 AK/SK 全留空，最省事；
- 没有 → 我给你 4.1 的逐屏操作，再走一遍新建 RAM 用户。
