// 云函数入口文件：管理端配置读写（隐藏管理页专用）
// 安全模型（三重）：
//   1. 密码校验（app_config/admin 文档中的 password 明文 或 passwordHash+salt）
//   2. openid 白名单（admin.openids 非空时，仅白名单内 openid 可用）
//   3. 失败锁定（同一 openid 连续失败 5 次锁 5 分钟）
// 所有配置改动都只写 app_config/open_time，getAppStatus 有 10 秒缓存会自动生效。
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const CONFIG_COLLECTION = 'app_config'
const CONFIG_DOC_ID = 'open_time'
const ADMIN_DOC_ID = 'admin'

// 首次使用（admin 文档不存在）时的默认管理密码，务必登录后立即修改
const DEFAULT_ADMIN_PASSWORD = 'echo@2026'

const DEFAULT_CONFIG = {
  enabled: true,
  message: '',
  windows: [
    { days: [1, 2, 3, 4, 5, 6, 7], start: '21:00', end: '23:00' }
  ],
  datesOverride: {}
}

const MAX_WINDOWS = 6
const MAX_MESSAGE_LEN = 100
const MAX_DATE_OVERRIDES = 30
const MAX_FAIL = 5
const LOCK_MS = 5 * 60 * 1000

// 邮箱订阅默认归类学校：历史未带学校的邮箱统一归到山东中医药大学
const EMAIL_DEFAULT_SCHOOL = '山东中医药大学'

// 失败计数（云函数实例内存级，够用且不增加数据库写入）
const failMap = new Map()

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex')
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

// "9:5" -> "09:05"；非法返回 null
function normalizeTime(str) {
  if (typeof str !== 'string') return null
  const matched = str.trim().match(/^(\d{1,2}):(\d{1,2})$/)
  if (!matched) return null
  const hour = Number(matched[1])
  const minute = Number(matched[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return `${pad2(hour)}:${pad2(minute)}`
}

function sanitizeWindows(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const win of list.slice(0, MAX_WINDOWS)) {
    if (!win) continue
    const start = normalizeTime(win.start)
    const end = normalizeTime(win.end)
    if (!start || !end) continue
    let days = Array.isArray(win.days) ? win.days.map(Number).filter(d => d >= 1 && d <= 7) : []
    days = Array.from(new Set(days)).sort((a, b) => a - b)
    out.push({ days, start, end })
  }
  return out
}

function sanitizeDatesOverride(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
  const out = {}
  const keys = Object.keys(obj).slice(0, MAX_DATE_OVERRIDES)
  for (const key of keys) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue
    const val = obj[key] || {}
    const item = {}
    if (val.closed) item.closed = true
    if (typeof val.message === 'string' && val.message.trim()) {
      item.message = val.message.trim().slice(0, MAX_MESSAGE_LEN)
    }
    if (Array.isArray(val.windows)) {
      const win = sanitizeWindows(val.windows)
      if (win.length) item.windows = win
    }
    if (Object.keys(item).length) out[key] = item
  }
  return out
}

function toStr(value) {
  if (!value) return ''
  try {
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'string') return value
    if (typeof value === 'object' && value.$date) return new Date(value.$date).toISOString()
  } catch (e) {
    // ignore
  }
  return ''
}

// 集合不存在时自动创建（云函数首次部署或新环境常见）
async function ensureCollection() {
  try {
    await db.createCollection(CONFIG_COLLECTION)
    console.log(`[adminConfig] 集合 ${CONFIG_COLLECTION} 创建成功`)
  } catch (e) {
    if (e.errCode === -501001 || (e.errMsg && e.errMsg.includes('already exists'))) {
      return // 已存在
    }
    throw e
  }
}

// 读取 admin 文档，不存在则按默认密码初始化（并返回 bootstrapped=true）
async function loadAdminDoc() {
  try {
    const res = await db.collection(CONFIG_COLLECTION).doc(ADMIN_DOC_ID).get()
    if (res && res.data) {
      return { doc: res.data, bootstrapped: false }
    }
  } catch (e) {
    // 集合或文档不存在，继续初始化
  }

  const salt = crypto.randomBytes(8).toString('hex')
  const doc = {
    _id: ADMIN_DOC_ID,
    enabled: true,
    salt,
    password: DEFAULT_ADMIN_PASSWORD,
    passwordHash: sha256(salt + DEFAULT_ADMIN_PASSWORD),
    openids: [],
    remark: '管理端配置。password/passwordHash 任一匹配即可登录；openids 非空时仅白名单内 openid 可进入；enabled=false 关闭管理入口。',
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  }

  try {
    await ensureCollection()
    await db.collection(CONFIG_COLLECTION).add({ data: doc })
    console.log('[adminConfig] 已初始化默认管理配置')
    return { doc, bootstrapped: true }
  } catch (err) {
    console.warn('[adminConfig] 初始化管理配置失败（将使用内存默认值）:', err)
    return { doc, bootstrapped: true, persistFailed: true }
  }
}

function isOpenidAllowed(adminDoc, openid) {
  const list = Array.isArray(adminDoc.openids) ? adminDoc.openids : []
  if (list.length === 0) return true // 未配置白名单：仅凭密码
  return list.indexOf(openid) !== -1
}

function verifyPassword(adminDoc, password) {
  if (typeof password !== 'string' || !password) return false
  if (typeof adminDoc.password === 'string' && adminDoc.password && adminDoc.password === password) {
    return true
  }
  if (adminDoc.passwordHash) {
    const salt = adminDoc.salt || ''
    return sha256(salt + password) === adminDoc.passwordHash
  }
  return false
}

function failState(openid) {
  const item = failMap.get(openid)
  if (!item) return { locked: false, count: 0 }
  if (item.until && item.until > Date.now()) {
    return { locked: true, remainMs: item.until - Date.now(), count: item.count }
  }
  return { locked: false, count: item.count || 0 }
}

function markFail(openid) {
  const item = failMap.get(openid) || { count: 0, until: 0 }
  item.count += 1
  if (item.count >= MAX_FAIL) {
    item.until = Date.now() + LOCK_MS
    item.count = 0
  }
  failMap.set(openid, item)
}

// 统一鉴权：返回 { ok, code, msg, adminDoc }，失败时 code 为 http 语义
async function auth(event, openid) {
  const state = failState(openid)
  if (state.locked) {
    return {
      ok: false,
      code: 429,
      msg: `密码错误次数过多，请 ${Math.ceil(state.remainMs / 60000)} 分钟后再试`
    }
  }

  const { doc, bootstrapped, persistFailed } = await loadAdminDoc()

  if (doc.enabled === false) {
    return { ok: false, code: 403, msg: '管理入口已关闭（app_config/admin.enabled=false）' }
  }

  if (!isOpenidAllowed(doc, openid)) {
    return { ok: false, code: 403, msg: '当前账号不在管理白名单内', openid }
  }

  if (!verifyPassword(doc, event.password)) {
    markFail(openid)
    const after = failState(openid)
    return {
      ok: false,
      code: 401,
      msg: after.locked
        ? '密码错误次数过多，已锁定 5 分钟'
        : `密码错误，还可尝试 ${Math.max(MAX_FAIL - after.count, 0)} 次`,
      bootstrapped,
      defaultPasswordHint: bootstrapped ? DEFAULT_ADMIN_PASSWORD : undefined,
      persistFailed
    }
  }

  failMap.delete(openid)
  return { ok: true, adminDoc: doc }
}

async function loadConfig() {
  try {
    const res = await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).get()
    return res && res.data ? res.data : null
  } catch (e) {
    return null
  }
}

function normalizeConfig(raw) {
  const source = raw || {}
  return {
    enabled: source.enabled !== false,
    message: typeof source.message === 'string' ? source.message.slice(0, MAX_MESSAGE_LEN) : '',
    windows: sanitizeWindows(source.windows),
    datesOverride: sanitizeDatesOverride(source.datesOverride)
  }
}

function packConfig(raw) {
  const config = normalizeConfig(raw)
  return {
    enabled: config.enabled,
    message: config.message,
    windows: config.windows,
    datesOverride: config.datesOverride,
    isOpen: raw && typeof raw.isOpen === 'boolean' ? raw.isOpen : undefined,
    lastToggleReason: (raw && raw.lastToggleReason) || '',
    lastToggleTime: toStr(raw && raw.lastToggleTime),
    updateTime: toStr(raw && raw.updateTime)
  }
}

// 历史邮箱（未带 school 或为空）统一归到山东中医药大学，写回数据库（幂等，跑完即停）
async function backfillEmailSchool() {
  const MAX_ROUNDS = 50
  for (let i = 0; i < MAX_ROUNDS; i++) {
    const res = await db.collection('email_subscribers')
      .where(_.or([{ school: _.exists(false) }, { school: '' }]))
      .limit(20)
      .get()
    const docs = (res && res.data) || []
    if (!docs.length) break
    for (const d of docs) {
      try {
        await db.collection('email_subscribers').doc(d._id).update({
          data: { school: EMAIL_DEFAULT_SCHOOL }
        })
      } catch (e) {
        // 单条失败忽略，下一轮重试
      }
    }
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || ''
  const action = event.action || 'ping'

  // ---- 探活：不需要密码，仅告知前端是否需要弹密码框 ----
  if (action === 'ping') {
    const { doc, bootstrapped, persistFailed } = await loadAdminDoc()
    const state = failState(openid)
    return {
      code: 0,
      openid,
      serverTime: Date.now(),
      adminEnabled: doc.enabled !== false,
      allowed: isOpenidAllowed(doc, openid),
      whitelistCount: Array.isArray(doc.openids) ? doc.openids.length : 0,
      locked: state.locked,
      lockedRemainMs: state.remainMs || 0,
      bootstrapped,
      persistFailed: !!persistFailed,
      defaultPasswordHint: bootstrapped ? DEFAULT_ADMIN_PASSWORD : undefined
    }
  }

  const authResult = await auth(event, openid)
  if (!authResult.ok) {
    return {
      code: authResult.code,
      msg: authResult.msg,
      openid,
      bootstrapped: authResult.bootstrapped,
      defaultPasswordHint: authResult.defaultPasswordHint,
      persistFailed: authResult.persistFailed
    }
  }

  if (action === 'login') {
    return {
      code: 0,
      msg: '登录成功',
      openid,
      serverTime: Date.now(),
      whitelistCount: Array.isArray(authResult.adminDoc.openids) ? authResult.adminDoc.openids.length : 0
    }
  }

  if (action === 'get') {
    const raw = await loadConfig()
    return {
      code: 0,
      openid,
      serverTime: Date.now(),
      data: packConfig(raw),
      isDefault: !raw
    }
  }

  if (action === 'save') {
    await ensureCollection()
    const input = event.config || {}
    const next = normalizeConfig(input)

    if (!next.windows.length && next.enabled) {
      return { code: 400, msg: '开启时间限制时，至少需要保留一个有效时段' }
    }

    const payload = Object.assign({}, next, {
      updateTime: db.serverDate(),
      updateBy: openid
    })

    const existing = await loadConfig()
    if (existing) {
      await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).update({ data: payload })
    } else {
      await db.collection(CONFIG_COLLECTION).add({
        data: Object.assign({ _id: CONFIG_DOC_ID, createTime: db.serverDate() }, payload)
      })
    }

    return {
      code: 0,
      msg: '保存成功',
      openid,
      serverTime: Date.now(),
      data: packConfig(next),
      tip: 'getAppStatus 最长 10 秒缓存，稍等片刻生效'
    }
  }

  if (action === 'reset') {
    await ensureCollection()
    const payload = Object.assign({}, DEFAULT_CONFIG, {
      updateTime: db.serverDate(),
      updateBy: openid
    })
    const existing = await loadConfig()
    if (existing) {
      await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).update({ data: payload })
    } else {
      await db.collection(CONFIG_COLLECTION).add({
        data: Object.assign({ _id: CONFIG_DOC_ID, createTime: db.serverDate() }, payload)
      })
    }
    return {
      code: 0,
      msg: '已恢复默认（每晚 21:00-23:00）',
      openid,
      data: packConfig(DEFAULT_CONFIG)
    }
  }

  if (action === 'changePassword') {
    const newPassword = typeof event.newPassword === 'string' ? event.newPassword.trim() : ''
    if (newPassword.length < 6) {
      return { code: 400, msg: '新密码至少 6 位' }
    }
    const salt = crypto.randomBytes(8).toString('hex')
    await db.collection(CONFIG_COLLECTION).doc(ADMIN_DOC_ID).update({
      data: {
        salt,
        password: newPassword,
        passwordHash: sha256(salt + newPassword),
        updateTime: db.serverDate()
      }
    })
    return { code: 0, msg: '密码已更新，请重新登录', password: newPassword }
  }

  if (action === 'bindOpenid') {
    // 把当前 openid 写入白名单（已有白名单时同样受密码保护，不会误锁自己）
    const doc = authResult.adminDoc
    const list = Array.isArray(doc.openids) ? doc.openids.slice() : []
    if (event.remove) {
      const idx = list.indexOf(openid)
      if (idx !== -1) list.splice(idx, 1)
    } else if (list.indexOf(openid) === -1) {
      list.push(openid)
    }
    await db.collection(CONFIG_COLLECTION).doc(ADMIN_DOC_ID).update({
      data: { openids: list, updateTime: db.serverDate() }
    })
    return { code: 0, msg: '白名单已更新', openid, openids: list }
  }

  // 导出邮箱订阅列表（未开放页收集，用于开放时邮件通知）
  // 按学校分类；历史未带学校的邮箱先回填归到山东中医药大学
  if (action === 'emailSubscribers') {
    try {
      await backfillEmailSchool()
    } catch (e) {
      console.warn('[adminConfig] 邮箱学校回填失败（不影响导出）:', e)
    }

    let list = []
    try {
      const limit = Math.min(Math.max(Number(event.limit) || 100, 1), 1000)
      const res = await db.collection('email_subscribers')
        .orderBy('subscribeTime', 'desc')
        .limit(limit)
        .get()
      list = (res.data || []).map(item => ({
        email: item.email,
        openid: item.openid || '',
        school: item.school || EMAIL_DEFAULT_SCHOOL,
        subscribeTime: toStr(item.subscribeTime)
      }))
    } catch (e) {
      // 集合不存在等场景返回空列表
    }

    // 按学校分组
    const groups = {}
    for (const item of list) {
      const key = item.school || EMAIL_DEFAULT_SCHOOL
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    }
    const schoolCounts = Object.keys(groups)
      .map(name => ({ name, count: groups[name].length }))
      .sort((a, b) => b.count - a.count)

    return {
      code: 0,
      openid,
      serverTime: Date.now(),
      total: list.length,
      data: list,
      groups,
      schoolCounts
    }
  }

  return { code: 400, msg: `未知操作：${action}` }
}
