# 「手机号 + 短信验证码」双通道部署与过审手册

> 项目：微信小程序「你的回声谷」 · 路径 `d:/原C盘/桌面/wechat-im`
> 目标：方案 A（阿里云**短信认证 PNVS**）立即上线过审 + 方案 B（传统**短信服务 Dysmsapi**）并行报备，用 `SMS_PROVIDER` 零代码改动切换。
> 本文件只含控制台/审核动作；代码改造已完成，见文末「一、代码改动清单」。

---

## 〇、先记住这 4 条（最容易踩坑）

| # | 结论 | 后果 |
|---|---|---|
| 1 | **`phoneLogin` 云函数也必须配阿里云 AK/SK 并装 PNVS SDK** | `CheckSmsVerifyCode` 是在 `phoneLogin` 里调用的，只给 `sendSmsCode` 配密钥，发送成功但登录必 500 |
| 2 | ✅ 已关闭（两个云函数均未配置 `SMS_DEV_MODE`）；提交审核前目视复核一次 | 若误设 `true`，登录页会显示黄色「【联调模式】验证码：xxxxxx」，截图直接露馅 |
| 3 | **赠送签名必须搭配赠送模板**，且两者都从 PNVS 控制台取 | 用自有签名会下发失败；PNVS 与「短信服务」的套餐包**不通用** |
| 4 | **`USERID_SALT = echo-valley-phone-2026` 部署后绝不可改** | 改了同一手机号会变成全新账号，用户数据"丢失" |

---

## 一、代码改动清单（已完成，勿重复实现）

| 文件 | 改动 |
|---|---|
| `cloudfunctions/sendSmsCode/index.js` | 双通道：`SMS_PROVIDER=pnvs`（默认）/ `sms`；PNVS 走 `SendSmsVerifyCode`；新增 `verifyMode` 落库；补 **5 条/小时** 限频；60 秒限频改用发送流水判定 |
| `cloudfunctions/sendSmsCode/package.json` | 新增 `@alicloud/dypnsapi20170525: ^2.0.0`，保留 Dysmsapi 依赖 |
| `cloudfunctions/phoneLogin/index.js` | `verifyMode=pnvs` 走官方 `CheckSmsVerifyCode`；`local` 保留原本地比对；`USERID_SALT`、`users` 表结构、返回结构均不变 |
| `cloudfunctions/phoneLogin/package.json` | 新增 `@alicloud/dypnsapi20170525: ^2.0.0` |
| `pages/privacy-policy/privacy-policy.wxml` | 四、共享披露改为「阿里云短信认证 / 短信服务」兼容表述并补充"核验" |
| `sms-env.example.json` | 两个云函数的环境变量样例（不含真实密钥） |

**前端 `pages/auth/*`、协议勾选、`users` 表结构、TIM / 聊天核心、`initDB` 全部未改动**——两个云函数的入参出参保持原契约：

- `sendSmsCode` → `{ code, message, maskedPhone, expireSeconds, devMode?, devCode? }`
- `phoneLogin` → `{ code, message, data: { userID, nickName, avatarUrl, maskedPhone, isNewUser } }`

### 与交接单不一致、已按阿里云官方文档/实测修正的点

| 项 | 交接单 | 核实结果 | 代码处理 |
|---|---|---|---|
| 核验成功判定 | 未明确 | **`Code=OK` 只代表接口调用成功**，真正结果看 `body.model.verifyResult === 'PASS'`（否则为 `UNKNOWN`） | 按 `PASS` 判定 |
| `CaseAuthPolicy` | `0` | 官方枚举只有 **1（不区分大小写）/ 2（区分）**，无 0 | 传 `1`；纯数字码下取值无影响 |
| `TemplateParam` | 未提 | PNVS 中是**必填**，且必须含 `##code##`；此时 `CodeType` 必填 | 默认 `{"code":"##code##","min":"5"}` 并加校验 |
| 验证码位数 | 6 位 | PNVS `CodeLength` **默认只有 4 位** | 显式 `codeLength: 6` |
| `SchemeName` | 未提 | 发送时若指定方案名，**核验必须传同一个值**，否则返回 `UNKNOWN` | 发送时把值写入 `sms_codes`，核验时复用 |
| SDK 底座 | 未提 | `@alicloud/dypnsapi20170525@2.0.0` 依赖 `openapi-core`，其 `Config` **不在**项目原有的 `openapi-client` 里 | 实测纯对象 `{accessKeyId, accessKeySecret, endpoint}` 可完成签名并到达阿里云，代码采用该写法，避免依赖传递包导出路径 |
| 核验结果字段大小写 | `body.Code` | 新 SDK 响应模型是 **小写** `body.code` / `body.model.verifyResult` | 加了 `pickBody()` 兼容两种大小写 |

> 另：`devMode` 不再靠两个云函数的环境变量"猜"，而是把 `verifyMode: 'pnvs' | 'local'` 写进 `sms_codes`，`phoneLogin` 直接读——避免配置漂移导致核验走错分支。

---

## 二、B. 开通与部署（按顺序做）

### B1 开通号码认证服务
1. 登录阿里云 → **号码认证服务 PNVS 控制台** → 开通服务。
2. 开启 **「短信认证」** 与 **「融合认证」** 两项。
   > 少开「融合认证」时 `SendSmsVerifyCode` 会返回 `FUNCTION_NOT_OPENED`（代码已转成中文提示）。

### B2 记录赠送签名与模板
- 控制台 → **赠送签名配置** (`dypns.console.aliyun.com/smsCertParamsConfig/sign`)：记下选中的**签名名称**。
- 控制台 → **赠送模板配置** (`.../template`)：记下**模板 CODE**，并看清模板内容里的变量名。
- 两者必须配套使用、不可自定义；短信里不显示自有品牌名，但**不影响本次腾讯营销审核**。
- 若模板变量不是 `code` / `min`（例如只有 `${code}`），把环境变量
  `ALIYUN_PNVS_TEMPLATE_PARAM` 改成对应的 JSON，如 `{"code":"##code##"}`，**必须保留 `##code##`**。

### B3 RAM 子账号（最小权限）
1. RAM → 创建用户 → 勾选 **永久 AccessKey**，保存 AK/SK。
2. 授权策略：`AliyunDypnsFullAccess`（号码认证服务完全访问，仅短信用）。
   > ⚠️ 官方系统策略名是 **`AliyunDypnsFullAccess`**（RAM code 为 `dypns`），另有只读版 `AliyunDypnsReadOnlyAccess`。**不存在 `AliyunDypnsapiFullAccess`** —— 交接单早期写法有误，2026-11-04 已按官方文档「号码认证服务系统权限策略参考」更正。该策略覆盖 `dypns:SendSmsVerifyCode` 与 `dypns:CheckSmsVerifyCode`，正好是本项目两个云函数要用的接口。
3. 若沿用项目里 `alicloudSecCheck` 已在用的那套 AK，确认它也挂了这个策略即可，不必新建。
4. **方案 B 报备通过后再补** `AliyunDysmsFullAccess`。

### B4 套餐包 / 余额 / 快速测试
1. 购买 **短信认证**套餐包或保证账户余额（注意：与「短信服务」套餐包**不通用**，是两个独立产品）。核验本身免费，只按运营商成功回执计短信费。
2. 控制台绑定**测试手机号**（最多 5 个），用「快速测试」确认真机收到短信。
3. 记录返回的签名/模板，确认短信内容是 6 位数字。

### B5 配置环境变量（★ 最容易漏 `phoneLogin`）

在 **云开发控制台 → 云函数 → 函数配置 → 环境变量**，两个函数分别配置。完整清单见 `sms-env.example.json`。

**`sendSmsCode`**

| 变量 | 值 |
|---|---|
| `ALIBABA_CLOUD_ACCESS_KEY_ID` / `..._SECRET` | B3 的 AK/SK |
| `SMS_PROVIDER` | `pnvs`（不配默认也是 `pnvs`） |
| `ALIYUN_PNVS_SIGN_NAME` | B2 的赠送签名名称 |
| `ALIYUN_PNVS_TEMPLATE_CODE` | B2 的赠送模板 CODE |
| `ALIYUN_PNVS_ENDPOINT` | `dypnsapi.aliyuncs.com` |
| `ALIYUN_PNVS_TEMPLATE_PARAM` | **不要显式配**。形如 `{"..."}` 的值会被 CloudBase CLI 自动解析成 object，而云端 `Environment.Variables[].Value` 只接受 string，实测会报 `InvalidParameter: The value type of parameter Environment.Variables.6.Value is not valid`。代码内置 `DEFAULT_PNVS_TEMPLATE_PARAM = JSON.stringify({code:'##code##',min:'5'})`，留空即可 |
| `ALIYUN_PNVS_SCHEME_NAME` | 可选，不填即用默认方案 |
| `SMS_DEV_MODE` | **联调期** `true`；**过审前删除或设 `false`**（2026-11-04 部署时两个函数均**未配置**此项 = 已关闭） |

**`phoneLogin`**

| 变量 | 值 |
|---|---|
| `ALIBABA_CLOUD_ACCESS_KEY_ID` / `..._SECRET` | 与上面**同一套**（核验在本函数执行，必须配） |
| `ALIYUN_PNVS_ENDPOINT` | `dypnsapi.aliyuncs.com` |
| `ALIYUN_PNVS_SCHEME_NAME` | 可选兜底；实际优先用 `sms_codes` 里发送时落库的值 |

> 方案 B 专用变量（`ALIYUN_SMS_*`）现在可以先不填；`SMS_PROVIDER=sms` 时才需要。

### B6 部署云函数 —— ✅ 2026-11-04 20:06 已全部完成

未走微信开发者工具，改用 **CloudBase CLI 3.8.3**（`tcb`）全自动完成，密钥全程在 git 仓库外：

- 部署暂存区：`C:\Users\huawei\WorkBuddy\2026-11-04-17-36-01\secrets\deploy\`
  （`cloudbaserc.json` 含 `functions[].envVariables` + 三个函数的代码副本；**纯英文路径**，规避中文路径打包问题）
- 命令形态：`tcb --config-file <仓库外/cloudbaserc.json> fn deploy <name> -e cloud1-d3gh3da2m2b1bafeb --region ap-shanghai --install-dependency true --json`
- 已部署：`sendSmsCode`、`phoneLogin`，并把本地已改的 **`initDB` 同步到云端**（原云端是旧版，只建 6 个集合）。
- 三者均 `Runtime=Nodejs16.13`（与原有 16 个函数一致）、`Timeout=20`、`Status=Active`、`CodeResult=success`、`InstallDependency=TRUE`。
- 环境变量回查：`sendSmsCode` 6 项、`phoneLogin` 3 项全部生效，**`SMS_DEV_MODE` 不存在**。
- 集合：调用新版 `initDB` 返回 `total=8 / error=0`，含 `sms_codes`、`sms_send_log`。
- 权限：用 `tcb api tcb ModifyDatabaseACL` 把两个集合设为 **`AclTag=ADMINONLY`**，`DescribeSafeRule` 回查均返回 `ADMINONLY` ✅
  （官方枚举：READONLY / PRIVATE / ADMINWRITE / **ADMINONLY = 仅管理员可读写**）。

> 如果以后手工在控制台部署，仍可按原方式「右键 → 上传并部署：云端安装依赖」，但注意 `initDB` 也要重新部署一次，且**两个短信函数都要配 AK/SK**。

### B7 云端联调自检 —— ✅ 2026-11-04 20:09 实测结果

| 验证 | 命令 | 结果 |
|---|---|---|
| 真实发送 | `tcb fn invoke sendSmsCode -d '{"phone":"189****7694","agreed":true}'` | `code=0`、`验证码已发送至 189****7694`、`expireSeconds=300`，**返回里没有 devCode** → 配置齐全、未误入联调模式；耗时 1.7s，云端 SDK 加载成功 |
| 错误码核验 | `tcb fn invoke phoneLogin -d '{"phone":"189****7694","code":"000000","agreed":true}'` | 日志捕获 `isv.ValidateFail`，返回 `code=400 / 验证码错误，还可尝试 4 次` → 修过的 bug 在**生产环境**生效、防刷计数正常 |
| 门禁状态 | `tcb fn invoke getAppStatus` | **`enabled=false` / `isOpen=true` / `reason=disabled`** |

⚠️ **交接单里「必须临时关门禁、只能 21:00–23:00 联调」在当前配置下不成立**：`getUserSig/index.js:98` 的判据是 `status.enabled && !status.isOpen` 才返回 403，当前 `enabled=false` 所以直接放行。**现在随时可以登录、随时可以截审核图**，无需动 `adminConfig`。若以后有人把门禁 `enabled` 打开，再按原计划临时关闭即可。

真机侧仍需你本人确认：输错码提示「还可尝试 N 次」、60 秒 / 5 条每小时 / 10 条每天限频、同一手机号重复登录拿到**同一个 userID**。

---

## 三、C. 过审动作

1. ✅ **已完成（2026-11-04 20:06）**：两个云函数均**未配置** `SMS_DEV_MODE`，仓库外 `secrets/wechat-im.env` 也已置 `false`；云端真实调用返回里无 `devCode`，登录页不会出现黄色联调提示。**提交审核前无需再改任何环境变量，只需在真机页面目视复核一次。**
2. 用真实短信完整走一遍，截三张图：
   - ① 手机号输入页（协议勾选可见）
   - ② 手机收到验证码的短信截图
   - ③ 输码登录成功页
3. 提交腾讯营销审核时，**注册方式统一表述**：
   > 「本小程序账号体系仅以**手机号**作为注册凭证，一个手机号对应一个账号，用户通过手机号 + 短信验证码完成注册/登录。」

   **不要**主动提内部 `userID` 的生成方式（哈希）。托管给阿里云的只是短信通道与验证码，不属于「QQ / 微信号 / 其他自定义账号注册」。
4. 协议页（用户协议四、账号管理；隐私政策二/三/四节）已写明「仅支持手机号 + 短信验证码」，提交前在小程序里点开确认文案已生效。

---

## 四、D. 并行推进方案 B（带品牌名短信）

1. 用**已企业认证 + 有营业执照**的阿里云账号，在「短信服务」控制台提交：
   - 资质（≤2 工作日）→ 签名（≤2h）→ 模板（≤2h）→ **运营商实名报备 7–10 工作日**。
2. 签名来源按最新规则只能用**企事业单位名**：营业执照全称，或含省市地域、从全称连续截取的简称；2–18 字符；不含 `【】`、括号、空格、`测试/test`。
   > 2025-03-17 起「公众号/小程序」签名来源已停用，2026-04-27 起「已上线 APP」也停用。场景说明附**登录页截图 + 登录后截图**。
3. 报备未完成就发会返回 `PORT_NOT_REGISTERED`（代码已转成中文提示）。状态变为「可用-正常」且「报备成功」后再切。
4. **零代码改动切换**：把 `sendSmsCode` 的
   - `SMS_PROVIDER` 改为 `sms`
   - 填 `ALIYUN_SMS_SIGN_NAME` / `ALIYUN_SMS_TEMPLATE_CODE` / `ALIYUN_SMS_TEMPLATE_PARAM` / `ALIYUN_SMS_ENDPOINT`
   - RAM 子账号补 `AliyunDysmsFullAccess`
   然后重新 `上传并部署：云端安装依赖` 即可。`phoneLogin` 会自动走本地比对分支（`verifyMode=local`）。

---

## 五、常见错误速查

| 现象 / 错误码 | 原因 | 处理 |
|---|---|---|
| `FUNCTION_NOT_OPENED` | 未开「融合认证」 | B1 |
| `INVALID_PARAMETERS` | 赠送签名/模板不匹配，或 `ALIYUN_PNVS_TEMPLATE_PARAM` 变量名不对 | B2 |
| `isv.ValidateFail` | **用户输错码 / 码已过期 / 被新码覆盖**。2026-11-04 真实 API 实测：它不是返回 `VerifyResult=UNKNOWN`，而是直接抛 HTTP 400 业务异常 | `phoneLogin` 已识别该类异常，转 400「验证码错误，还可尝试 N 次」并累加 `attempts`（否则会误报 500 且绕过 5 次错误锁定） |
| `biz.FREQUENCY` | 核验频次超限（同一号码核验太频繁） | 已转 429「操作过于频繁」；等 `Interval` 60 秒 |
| `BUSINESS_LIMIT_CONTROL` | 官方日级流控 / 本地 5 条每小时 | 等 1 小时或次日 |
| `PORT_NOT_REGISTERED` | 方案 B 运营商报备未完成 | 继续等，不要提前切 `sms` |
| 发送成功、登录一直 500 | `phoneLogin` 没配 AK/SK 或没云端安装依赖 | B5 / B6 |
| 输正确码仍提示「验证码错误」 | `SchemeName` 发送与核验不一致，或模板用了自定义码而非 `##code##` | 检查 `sms_codes.schemeName` 与 `ALIYUN_PNVS_TEMPLATE_PARAM` |
| 登录时报「当前不在开放时间」 | `getUserSig` 门禁 | B7 第 1 步 |
| 审核截图里有黄色验证码提示 | `SMS_DEV_MODE` 未关 | C 第 1 步 |

---

## 六、注意事项（保留）

- `USERID_SALT` 部署后不可修改。
- 旧 `_openid` 用户数据**不迁移**，与手机号新账号并存。
- `getUserSig` 内硬编码的 TIM `SDKAppID` / `privateKey` 是既有情况，非本次改动范围（建议后续单独处理）。
- 官方限频已全部落地：**1 条/分钟、5 条/小时、10 条/天**（本地），另有单微信号 20 条/天防换号刷。
- PNVS 模式下 `sms_codes.code` 为 `null`（码由阿里云托管），`sms_codes` / `sms_send_log` 保留用于限频、过期与审计。
