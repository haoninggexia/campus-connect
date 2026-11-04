// 云函数：发送手机号注册/登录短信验证码（双通道）
//
// SMS_PROVIDER=pnvs（默认，方案 A）：阿里云「号码认证服务 / 短信认证」Dypnsapi
//   → 免资质、免签名、免模板、免运营商报备，官方称对接 API 当天可用；用控制台赠送签名 + 赠送模板。
// SMS_PROVIDER=sms（方案 B）：阿里云传统「短信服务」Dysmsapi
//   → 需企业资质 + 自有签名/模板 + 7~10 工作日运营商报备，报备通过后零代码改动切回带品牌名的短信。
//
// 两个通道共用完全相同的入参出参，前端 pages/auth/auth.js 无需任何改动。
//
// ====== 环境变量 ======
// 通用（sendSmsCode 与 phoneLogin 两个云函数都要配置同一套 AK/SK）：
//   ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET  RAM 子账号 AK
//   SMS_PROVIDER                 pnvs（默认）| sms
//   SMS_DEV_MODE=true            仅联调：不真发短信、返回 devCode。提交审核前必须删除或设为 false
// pnvs 专用：
//   ALIYUN_PNVS_SIGN_NAME        控制台「赠送签名配置」页的签名名称
//   ALIYUN_PNVS_TEMPLATE_CODE    控制台「赠送模板配置」页的模板 CODE
//   ALIYUN_PNVS_ENDPOINT         默认 dypnsapi.aliyuncs.com
//   ALIYUN_PNVS_TEMPLATE_PARAM   默认 {"code":"##code##","min":"5"}；必须含 ##code## 占位符
//   ALIYUN_PNVS_SCHEME_NAME      可选。若填写，发送与核验必须一致（代码已把值写入 sms_codes 由 phoneLogin 复用）
// sms 专用：
//   ALIYUN_SMS_SIGN_NAME / ALIYUN_SMS_TEMPLATE_CODE
//   ALIYUN_SMS_TEMPLATE_PARAM    可选，模板变量名，默认 code
//   ALIYUN_SMS_ENDPOINT          默认 dysmsapi.aliyuncs.com
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const SMS_CODES = 'sms_codes'   // 当前有效验证码（每个手机号一条）
const SEND_LOG = 'sms_send_log' // 发送流水，用于限频防刷与审计

const CODE_TTL = 5 * 60 * 1000      // 验证码 5 分钟有效
const RESEND_INTERVAL = 60 * 1000   // 1 条/分钟
const HOUR_MS = 60 * 60 * 1000
const PHONE_HOUR_LIMIT = 5          // 5 条/小时（官方规则，原实现缺失）
const PHONE_DAY_LIMIT = 10          // 10 条/天
const OPENID_DAY_LIMIT = 20         // 同一微信号 20 条/天（防止换号刷短信）
const LOG_KEEP_DAYS = 7

// 阿里云「短信认证」把验证码的生成与核验托管在云端：
// SendSmsVerifyCode 的 TemplateParam 必须传 ##code## 让系统生成，
// 否则 phoneLogin 侧的 CheckSmsVerifyCode 无法完成校验（官方明确说明）。
const DEFAULT_PNVS_TEMPLATE_PARAM = JSON.stringify({ code: '##code##', min: '5' })

function getProvider() {
  const p = String(process.env.SMS_PROVIDER || 'pnvs').trim().toLowerCase()
  return p === 'sms' ? 'sms' : 'pnvs'
}

// 按北京时间划分自然日，避免 UTC 日期导致限频跨天判断错误
function beijingDay(now) {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function maskPhone(phone) {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
}

// 云函数首次调用时惰性建集合，避免手动去控制台创建
async function ensureCollection(name) {
  try {
    await db.createCollection(name)
  } catch (e) {
    if (!e.errMsg || !e.errMsg.includes('already exists')) {
      console.warn(`[sendSmsCode] 创建集合 ${name} 未成功（可能已存在）:`, e.errMsg || e.message)
    }
  }
}

// Tea / Darabonba 各代 SDK 响应字段大小写不一致，统一成小写再判断
function pickBody(resp) {
  const b = (resp && resp.body) || {}
  return {
    code: b.code || b.Code,
    message: b.message || b.Message,
    success: b.success !== undefined ? b.success : b.Success,
    model: b.model || b.Model || {},
    requestId: b.requestId || b.RequestId
  }
}

class SmsApiError extends Error {
  constructor(apiCode, message) {
    super(message || apiCode || '短信接口异常')
    this.apiCode = apiCode || ''
  }
}

// ---------------- 方案 B：传统「短信服务」Dysmsapi（保持原实现） ----------------
async function sendAliyunSms({ phone, code, signName, templateCode, ak, sk }) {
  const Dysmsapi = require('@alicloud/dysmsapi20170525')
  const { Config } = require('@alicloud/openapi-client')
  const { RuntimeOptions } = require('@alicloud/tea-util')

  // 兼容 Tea SDK 不同大版本的导出形态
  const Client = Dysmsapi.default || Dysmsapi
  const SendSmsRequest = Dysmsapi.SendSmsRequest
  if (typeof Client !== 'function' || typeof SendSmsRequest !== 'function') {
    throw new Error('@alicloud/dysmsapi20170525 版本不兼容，请检查云函数依赖')
  }

  const config = new Config({
    accessKeyId: ak,
    accessKeySecret: sk,
    endpoint: process.env.ALIYUN_SMS_ENDPOINT || 'dysmsapi.aliyuncs.com'
  })
  const client = new Client(config)
  const paramKey = process.env.ALIYUN_SMS_TEMPLATE_PARAM || 'code'
  const req = new SendSmsRequest({
    phoneNumbers: phone,
    signName,
    templateCode,
    templateParam: JSON.stringify({ [paramKey]: code })
  })

  const resp = typeof client.sendSmsWithOptions === 'function'
    ? await client.sendSmsWithOptions(req, new RuntimeOptions({}))
    : await client.sendSms(req)
  const body = pickBody(resp)
  if (body.code !== 'OK') {
    throw new SmsApiError(body.code, body.message || `阿里云短信返回 ${body.code}`)
  }
  return body
}

// ---------------- 方案 A：「短信认证」PNVS / Dypnsapi ----------------
// 注意：@alicloud/dypnsapi20170525@2.0.0 基于 @alicloud/openapi-core + @darabonba/typescript，
// 其 Config 不在项目里已有的 @alicloud/openapi-client 中。实测纯对象配置即可被 SDK 正确签名，
// 因此这里不引用 SDK 的传递依赖，避免不同 npm 扁平化结果下的导出路径差异。
function createPnvsClient({ ak, sk, endpoint, requestKey }) {
  const Dypnsapi = require('@alicloud/dypnsapi20170525')
  const Client = Dypnsapi.default || Dypnsapi
  const RequestClass = Dypnsapi[requestKey]
  if (typeof Client !== 'function' || typeof RequestClass !== 'function') {
    throw new Error('@alicloud/dypnsapi20170525 版本不兼容，请使用 ^2.0.0')
  }
  const client = new Client({ accessKeyId: ak, accessKeySecret: sk, endpoint })
  return { client, RequestClass }
}

async function sendPnvsVerifyCode({ phone, signName, templateCode, ak, sk, outId, schemeName }) {
  const { client, RequestClass } = createPnvsClient({
    ak,
    sk,
    endpoint: process.env.ALIYUN_PNVS_ENDPOINT || 'dypnsapi.aliyuncs.com',
    requestKey: 'SendSmsVerifyCodeRequest'
  })

  const templateParam = process.env.ALIYUN_PNVS_TEMPLATE_PARAM || DEFAULT_PNVS_TEMPLATE_PARAM
  if (templateParam.indexOf('##code##') === -1) {
    throw new Error('ALIYUN_PNVS_TEMPLATE_PARAM 必须包含 ##code##，否则阿里云无法核验验证码')
  }

  const req = new RequestClass({
    phoneNumber: phone,
    signName,
    templateCode,
    templateParam,
    codeLength: 6,                    // 前端固定 6 位输入（SDK 默认只有 4 位）
    codeType: 1,                      // 纯数字；用 ##code## 占位符时该参数必填
    validTime: CODE_TTL / 1000,       // 300 秒
    interval: RESEND_INTERVAL / 1000, // 60 秒，与本地限频保持一致
    duplicatePolicy: 1,               // 新码覆盖旧码，与 sms_codes 单条覆盖写入一致
    returnVerifyCode: false,          // 验证码不回传业务侧，核验交给阿里云
    outId,
    countryCode: '86'
  })
  if (schemeName) req.schemeName = schemeName

  let resp
  try {
    // 不带 runtime 的重载会由 SDK 内部创建默认 RuntimeOptions
    resp = await client.sendSmsVerifyCode(req)
  } catch (e) {
    throw new SmsApiError(e.code || e.apiCode || '', e.message)
  }
  const body = pickBody(resp)
  if (body.code !== 'OK' || body.success === false) {
    throw new SmsApiError(body.code, body.message)
  }
  return body
}

// 把阿里云错误码转成可执行的提示，方便部署阶段自助排障
function friendlySendError(e) {
  const c = String(e.apiCode || '')
  if (c === 'FUNCTION_NOT_OPENED') return '短信认证未开通，请在号码认证服务控制台开启「短信认证」与「融合认证」'
  if (c === 'BUSINESS_LIMIT_CONTROL') return '发送过于频繁，请稍后再试'
  if (c === 'MOBILE_NUMBER_ILLEGAL') return '请输入正确的手机号'
  if (c === 'INVALID_PARAMETERS') return '短信签名或模板配置有误，请核对控制台赠送签名/模板'
  if (c === 'PORT_NOT_REGISTERED') return '短信通道尚未完成运营商报备'
  return '验证码发送失败，请稍后重试'
}

exports.main = async (event = {}) => {
  const openid = cloud.getWXContext().OPENID || ''
  const phone = String(event.phone || '').trim()

  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return { code: 400, message: '请输入正确的手机号' }
  }
  if (event.agreed !== true) {
    return { code: 403, message: '请先阅读并同意用户协议和隐私政策' }
  }

  await ensureCollection(SMS_CODES)
  await ensureCollection(SEND_LOG)

  const now = Date.now()
  const dayKey = beijingDay(now)

  // 保留：取该手机号当前唯一有效验证码，供后面覆盖写入
  const recentRes = await db.collection(SMS_CODES).where({ phone }).limit(1).get()
  const recent = recentRes.data[0]

  // 官方限频：1 条/分钟、5 条/小时、10 条/天，全部按手机号统计。
  // 用 sms_send_log 而不是 sms_codes 判断 60 秒间隔：登录成功后验证码记录会被删除，
  // 只看 sms_codes 会让「刚登录完立刻重发」绕过 60 秒限制。
  const hourLogsRes = await db.collection(SEND_LOG)
    .where({ phone, createTime: _.gte(now - HOUR_MS) })
    .limit(100)
    .get()
  const hourLogs = hourLogsRes.data || []

  // 限频 1：1 条/分钟
  const lastSendTime = hourLogs.reduce((max, item) => Math.max(max, item.createTime || 0), 0)
  if (lastSendTime && now - lastSendTime < RESEND_INTERVAL) {
    const wait = Math.ceil((RESEND_INTERVAL - (now - lastSendTime)) / 1000)
    return { code: 429, message: `请 ${wait} 秒后再试`, waitSeconds: wait }
  }
  // 限频 2：5 条/小时（新增）
  if (hourLogs.length >= PHONE_HOUR_LIMIT) {
    return { code: 429, message: '该手机号发送过于频繁，请 1 小时后再试' }
  }
  // 限频 3：单手机号 10 条/日
  const phoneCount = await db.collection(SEND_LOG).where({ phone, dayKey }).count()
  if ((phoneCount.total || 0) >= PHONE_DAY_LIMIT) {
    return { code: 429, message: '该手机号今日发送次数过多，请明天再试' }
  }
  // 限频 4：单微信号 20 条/日（防止换号刷短信）
  if (openid) {
    const openidCount = await db.collection(SEND_LOG).where({ openid, dayKey }).count()
    if ((openidCount.total || 0) >= OPENID_DAY_LIMIT) {
      return { code: 429, message: '今日操作过于频繁，请明天再试' }
    }
  }

  const p = getProvider()
  const ak = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID
  const sk = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET
  const signName = p === 'pnvs'
    ? process.env.ALIYUN_PNVS_SIGN_NAME
    : process.env.ALIYUN_SMS_SIGN_NAME
  const templateCode = p === 'pnvs'
    ? process.env.ALIYUN_PNVS_TEMPLATE_CODE
    : process.env.ALIYUN_SMS_TEMPLATE_CODE
  const schemeName = String(process.env.ALIYUN_PNVS_SCHEME_NAME || '').trim()
  const missingConfig = !signName || !templateCode || !ak || !sk
  const devMode = process.env.SMS_DEV_MODE === 'true' || missingConfig

  // verifyMode 写进 sms_codes，由 phoneLogin 直接读取：
  // 两个云函数各自的环境变量无需再人工保持同步，也不会因配置漂移导致核验走错分支。
  //   pnvs  = 验证码由阿里云生成，本地不存码，交给 CheckSmsVerifyCode 核验
  //   local = 本地生成并存码（联调模式 / 方案 B）
  const verifyMode = (!devMode && p === 'pnvs') ? 'pnvs' : 'local'
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const outId = 'ev_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 10)
  let pnvsBody = null

  if (devMode) {
    // 短信签名/模板审核期间可用此模式先把注册流程联调跑通
    console.warn('[sendSmsCode] 联调模式：未真实发送短信，验证码随返回值下发。phone=', phone, 'code=', code)
  } else {
    try {
      if (p === 'pnvs') {
        pnvsBody = await sendPnvsVerifyCode({ phone, signName, templateCode, ak, sk, outId, schemeName })
      } else {
        await sendAliyunSms({ phone, code, signName, templateCode, ak, sk })
      }
    } catch (e) {
      console.error('[sendSmsCode] 短信发送失败:', { provider: p, apiCode: e.apiCode || '', message: e.message })
      return { code: 500, message: friendlySendError(e) }
    }
  }

  // 覆盖写入该手机号当前唯一有效验证码
  const record = {
    phone,
    provider: p,
    verifyMode,
    // pnvs 模式下绝不写入明文验证码：码在阿里云侧，本地只留元数据
    code: verifyMode === 'pnvs' ? null : code,
    openid,
    outId: verifyMode === 'pnvs' ? outId : '',
    schemeName: verifyMode === 'pnvs' ? schemeName : '',
    bizId: (pnvsBody && pnvsBody.model && pnvsBody.model.bizId) || '',
    sendTime: now,
    expireAt: now + CODE_TTL,
    attempts: 0,
    updateTime: db.serverDate()
  }
  if (recent && recent._id) {
    await db.collection(SMS_CODES).doc(recent._id).update({ data: record })
  } else {
    await db.collection(SMS_CODES).add({ data: { ...record, createTime: db.serverDate() } })
  }

  await db.collection(SEND_LOG).add({
    data: { phone, openid, dayKey, provider: p, verifyMode, outId, createTime: now }
  })

  // 清理历史流水，避免集合无限增长（失败不影响主流程）
  try {
    await db.collection(SEND_LOG)
      .where({ createTime: _.lt(now - LOG_KEEP_DAYS * 86400000) })
      .remove()
  } catch (e) {
    console.warn('[sendSmsCode] 清理发送流水失败:', e.errMsg || e.message)
  }

  const maskedPhone = maskPhone(phone)
  return {
    code: 0,
    message: `验证码已发送至 ${maskedPhone}`,
    maskedPhone,
    expireSeconds: CODE_TTL / 1000,
    // 仅联调模式返回；生产配置好短信后必须关闭 SMS_DEV_MODE
    ...(devMode ? { devMode: true, devCode: code } : {})
  }
}
