// 云函数：校验短信验证码，按手机号注册/登录（双通道）
// 账号体系以手机号为唯一凭证，不再使用微信 openid 或微信授权资料
//
// 核验分支由 sendSmsCode 写入 sms_codes 的 verifyMode 字段决定，不依赖本函数的环境变量推断：
//   pnvs  = 方案 A，验证码由阿里云「短信认证」生成，调 CheckSmsVerifyCode 闭环核验
//   local = 方案 B / 联调模式，验证码本地生成，比对 sms_codes.code
//
// 两个通道共用完全相同的入参出参，前端 pages/auth/auth.js 无需任何改动。
//
// ====== 环境变量（PNVS 核验在【本函数】执行，AK/SK 必须也给 phoneLogin 配一份）======
//   ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET
//   ALIYUN_PNVS_ENDPOINT       可选，默认 dypnsapi.aliyuncs.com
//   ALIYUN_PNVS_SCHEME_NAME    可选，仅作为兜底；实际优先用 sms_codes 里发送时存下的值
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const SMS_CODES = 'sms_codes'
const USERS = 'users'
const MAX_ATTEMPTS = 5
const DEFAULT_AVATAR = '/image/my_head.jpeg'
const DEFAULT_NICKNAME = '可爱的小朋友'

// ⚠️ 部署后切勿修改此盐值，否则同一手机号会生成不同的 userID，导致用户丢失账号
// 用哈希而非明文手机号拼接 userID，避免手机号在聊天室、个人资料等处泄露
const USERID_SALT = 'echo-valley-phone-2026'

function buildUserID(phone) {
  return 'u_' + crypto.createHash('sha256').update(USERID_SALT + phone).digest('hex').slice(0, 24)
}

function maskPhone(phone) {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name)
  } catch (e) {
    // 已存在则忽略
  }
}

async function consumeCode(id) {
  try {
    await db.collection(SMS_CODES).doc(id).remove()
  } catch (e) {
    console.warn('[phoneLogin] 删除验证码失败:', e.errMsg || e.message)
  }
}

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
    super(message || apiCode || '短信核验接口异常')
    this.apiCode = apiCode || ''
  }
}

// 官方「融合认证（基于原子能力）」返回码实测（2026-11-04 真实 API 联调）：
// 用户输错验证码 / 码已过期 / 被新码覆盖时，CheckSmsVerifyCode 并不返回
// VerifyResult=UNKNOWN，而是直接抛 HTTP 400 业务异常 isv.ValidateFail。
// 若把它和其它异常一样当成 500，用户会看到「登录失败，请稍后重试」，
// 且 attempts 不累加 → 「最多 5 次错误」的防暴力破解限制被绕过。
// 因此这类必须识别为用户输入错误，走 fail() 计数并给出可重试提示。
function isPnvsCodeRejected(apiCode) {
  return /^(isv\.)?validatefail$/i.test(String(apiCode || '').trim())
}

// 核验频次/号码流控属于限流，不属于验证码错误，单独给出 429。
function isPnvsRateLimited(apiCode) {
  const c = String(apiCode || '').trim()
  return /^(biz\.FREQUENCY|isv\.BUSINESS_LIMIT_CONTROL)$/i.test(c)
}

// ---------------- 方案 A：官方 CheckSmsVerifyCode 闭环核验 ----------------
// 官方口径：Code=OK 只代表「接口调用成功」，核验结果必须看 Model.VerifyResult（PASS / UNKNOWN）。
// @alicloud/dypnsapi20170525@2.0.0 基于 openapi-core，纯对象配置即可完成签名（已实测）。
async function checkPnvsVerifyCode({ phone, code, ak, sk, outId, schemeName }) {
  const Dypnsapi = require('@alicloud/dypnsapi20170525')
  const Client = Dypnsapi.default || Dypnsapi
  const RequestClass = Dypnsapi.CheckSmsVerifyCodeRequest
  if (typeof Client !== 'function' || typeof RequestClass !== 'function') {
    throw new Error('@alicloud/dypnsapi20170525 版本不兼容，请使用 ^2.0.0')
  }

  const client = new Client({
    accessKeyId: ak,
    accessKeySecret: sk,
    endpoint: process.env.ALIYUN_PNVS_ENDPOINT || 'dypnsapi.aliyuncs.com'
  })
  const req = new RequestClass({
    phoneNumber: phone,
    verifyCode: code,
    countryCode: '86',
    // 官方枚举为 1（不区分大小写）/ 2（区分大小写），无 0；本方案用纯数字码，取值不影响结果
    caseAuthPolicy: 1
  })
  // 发送时若指定了方案名称，核验必须传同一个值，否则阿里云按不同方案查找会返回 UNKNOWN
  if (schemeName) req.schemeName = schemeName
  if (outId) req.outId = outId

  let resp
  try {
    resp = await client.checkSmsVerifyCode(req)
  } catch (e) {
    throw new SmsApiError(e.code || e.apiCode || '', e.message)
  }
  const body = pickBody(resp)
  if (body.code !== 'OK' || body.success === false) {
    throw new SmsApiError(body.code, body.message)
  }
  const verifyResult = body.model && (body.model.verifyResult || body.model.VerifyResult)
  return verifyResult === 'PASS'
}

exports.main = async (event = {}) => {
  const phone = String(event.phone || '').trim()
  const code = String(event.code || '').trim()

  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return { code: 400, message: '请输入正确的手机号' }
  }
  if (!/^\d{6}$/.test(code)) {
    return { code: 400, message: '请输入 6 位验证码' }
  }
  if (event.agreed !== true) {
    return { code: 403, message: '请先阅读并同意用户协议和隐私政策' }
  }

  let record
  try {
    const res = await db.collection(SMS_CODES).where({ phone }).limit(1).get()
    record = res.data[0]
  } catch (e) {
    console.warn('[phoneLogin] 读取验证码失败（集合可能尚未创建）:', e.errMsg || e.message)
    return { code: 400, message: '请先获取验证码' }
  }

  if (!record) {
    return { code: 400, message: '请先获取验证码' }
  }

  // 兼容改造前遗留的记录：有 code 走本地比对，无 code 视为 pnvs
  const verifyMode = record.verifyMode || (record.code ? 'local' : 'pnvs')
  if (verifyMode === 'local' && !record.code) {
    return { code: 400, message: '请先获取验证码' }
  }
  if (Date.now() > record.expireAt) {
    await consumeCode(record._id)
    return { code: 400, message: '验证码已过期，请重新获取' }
  }

  const attempts = record.attempts || 0
  if (attempts >= MAX_ATTEMPTS) {
    await consumeCode(record._id)
    return { code: 400, message: '错误次数过多，请重新获取验证码' }
  }

  const fail = async () => {
    try {
      await db.collection(SMS_CODES).doc(record._id).update({
        data: { attempts: attempts + 1 }
      })
    } catch (e) {
      console.warn('[phoneLogin] 累加尝试次数失败:', e.errMsg || e.message)
    }
    const left = MAX_ATTEMPTS - attempts - 1
    return {
      code: 400,
      message: left > 0 ? `验证码错误，还可尝试 ${left} 次` : '错误次数过多，请重新获取验证码'
    }
  }

  if (verifyMode === 'pnvs') {
    const ak = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID
    const sk = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET
    if (!ak || !sk) {
      console.error('[phoneLogin] 缺少阿里云 AK/SK：PNVS 核验在 phoneLogin 执行，本函数也必须配置环境变量')
      return { code: 500, message: '登录失败，请稍后重试' }
    }
    let passed = false
    try {
      passed = await checkPnvsVerifyCode({
        phone,
        code,
        ak,
        sk,
        outId: record.outId,
        // 优先用发送时落库的值，确保与 SendSmsVerifyCode 完全一致
        schemeName: record.schemeName === undefined
          ? String(process.env.ALIYUN_PNVS_SCHEME_NAME || '').trim()
          : record.schemeName
      })
    } catch (e) {
      const apiCode = String(e.apiCode || e.code || '').trim()
      if (isPnvsCodeRejected(apiCode)) {
        // 输错 / 过期 / 被覆盖：与 VerifyResult=UNKNOWN 同样按失败计数处理
        console.warn('[phoneLogin] 验证码校验未通过:', { apiCode, message: e.message })
        return await fail()
      }
      if (isPnvsRateLimited(apiCode)) {
        console.warn('[phoneLogin] 核验触发限流:', { apiCode, message: e.message })
        return { code: 429, message: '操作过于频繁，请稍后再试' }
      }
      console.error('[phoneLogin] 阿里云核验接口异常:', { apiCode, message: e.message })
      return { code: 500, message: '登录失败，请稍后重试' }
    }
    if (!passed) {
      return await fail()
    }
  } else if (record.code !== code) {
    return await fail()
  }

  // 校验通过，立即消费验证码，防止重放
  await consumeCode(record._id)
  await ensureCollection(USERS)

  const userID = buildUserID(phone)
  const maskedPhone = maskPhone(phone)

  try {
    const userRes = await db.collection(USERS).where({ phone }).limit(1).get()

    if (userRes.data.length > 0) {
      const user = userRes.data[0]
      // 兼容早期把脱敏手机号当作默认昵称的老用户
      const legacyDefault = !user.nickName || user.nickName === maskedPhone
      const nickName = legacyDefault ? DEFAULT_NICKNAME : user.nickName
      const updateData = { lastLoginTime: db.serverDate(), updateTime: db.serverDate() }
      if (legacyDefault) updateData.nickName = DEFAULT_NICKNAME
      await db.collection(USERS).doc(user._id).update({ data: updateData })
      return {
        code: 0,
        message: '登录成功',
        data: {
          userID: user.userID || userID,
          nickName,
          avatarUrl: user.avatarUrl || DEFAULT_AVATAR,
          maskedPhone,
          isNewUser: false
        }
      }
    }

    await db.collection(USERS).add({
      data: {
        userID,
        phone,
        nickName: DEFAULT_NICKNAME,
        avatarUrl: DEFAULT_AVATAR,
        loginType: 'phone_sms',
        createTime: db.serverDate(),
        lastLoginTime: db.serverDate()
      }
    })
    return {
      code: 0,
      message: '注册成功',
      data: {
        userID,
        nickName: DEFAULT_NICKNAME,
        avatarUrl: DEFAULT_AVATAR,
        maskedPhone,
        isNewUser: true
      }
    }
  } catch (e) {
    console.error('[phoneLogin] 用户表读写失败:', e)
    return { code: 500, message: '登录失败，请稍后重试' }
  }
}
