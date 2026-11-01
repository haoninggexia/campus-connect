// 云函数入口文件：应用开放时间状态（方案 A + B）
// 以云数据库 app_config 配置为准，按【服务端时间】换算北京时间（UTC+8）判定是否在开放时段。
// 前端只负责展示，真正的放行判定以本函数返回的 isOpen 为准（客户端时间不可信）。
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 集合不存在时自动创建（新环境或漏跑 initDB 时兜底）
async function ensureCollection() {
  try {
    await db.createCollection(CONFIG_COLLECTION)
    console.log(`[getAppStatus] 集合 ${CONFIG_COLLECTION} 创建成功`)
  } catch (e) {
    if (e.errCode === -501001 || (e.errMsg && e.errMsg.includes('already exists'))) {
      return // 已存在
    }
    throw e
  }
}

const CONFIG_COLLECTION = 'app_config'
const CONFIG_DOC_ID = 'open_time'

const DAY_MS = 24 * 60 * 60 * 1000
const BJ_OFFSET = 8 * 60 * 60 * 1000 // 北京时间相对 UTC 的偏移

// 默认配置：每晚 21:00 - 23:00（北京时间），全周生效
// 数据库里还没有配置时会使用该默认值，保证功能开箱即用
const DEFAULT_CONFIG = {
  enabled: true,
  message: '',
  windows: [
    { days: [1, 2, 3, 4, 5, 6, 7], start: '21:00', end: '23:00' }
  ],
  datesOverride: {}
}

// 短缓存：避免首页 3 秒轮询把云函数调用量打满
let _cache = { at: 0, data: null }
const CACHE_TTL = 10 * 1000

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

// "21:00" -> 分钟数
function parseHM(str) {
  if (typeof str !== 'string') return null
  const matched = str.trim().match(/^(\d{1,2}):(\d{1,2})$/)
  if (!matched) return null
  const hour = Number(matched[1])
  const minute = Number(matched[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

function normalizeWindow(win) {
  if (!win) return null
  const startMin = parseHM(win.start)
  const endMin = parseHM(win.end)
  if (startMin === null || endMin === null) return null
  return {
    start: win.start,
    end: win.end,
    startMin,
    endMin,
    crossDay: endMin <= startMin // 跨天时段，如 22:00 - 02:00
  }
}

// 时间戳 -> 北京时间字符串
function formatBJ(ts) {
  const d = new Date(ts + BJ_OFFSET)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ` +
    `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`
}

// 北京时间当天 00:00 对应的“位移时间戳”（ts + BJ_OFFSET 后按天取整）
function bjDayStartShifted(ts) {
  return Math.floor((ts + BJ_OFFSET) / DAY_MS) * DAY_MS
}

function dateKeyOfShifted(shifted) {
  const d = new Date(shifted)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

// 取某一天生效的窗口（datesOverride 优先级最高）
function windowsOfDay(config, shiftedDayStart) {
  const dateKey = dateKeyOfShifted(shiftedDayStart)
  const weekday = new Date(shiftedDayStart).getUTCDay()
  const dayNumber = weekday === 0 ? 7 : weekday // 1=周一 ... 7=周日

  const override = (config.datesOverride || {})[dateKey]
  let rawList = null

  if (override) {
    if (override.closed) {
      return { dateKey, dayNumber, windows: [], override, closed: true }
    }
    if (Array.isArray(override.windows)) {
      rawList = override.windows
    }
  }

  if (!rawList) {
    rawList = (config.windows || []).filter(win => {
      if (!Array.isArray(win.days) || win.days.length === 0) return true
      return win.days.indexOf(dayNumber) !== -1
    })
  }

  const windows = rawList.map(normalizeWindow).filter(Boolean)
  return { dateKey, dayNumber, windows, override, closed: false }
}

// 核心判定：给定服务端当前时间，计算开放状态
function computeStatus(nowTs, config) {
  const enabled = !(config && config.enabled === false)

  if (!enabled) {
    return {
      isOpen: true,
      enabled: false,
      reason: 'disabled',
      message: '',
      nextOpenTime: null,
      nextCloseTime: null,
      nextOpenTimeStr: '',
      nextOpenDateStr: '',
      todayWindowsText: '',
      todayWindows: []
    }
  }

  const baseShifted = bjDayStartShifted(nowTs)
  let openInterval = null
  let nextOpen = null
  let todayWindows = []
  let todayClosed = false
  let overrideMessage = ''

  // 从“昨天”开始扫描（兼容跨天时段），向后扫描 7 天，足够覆盖任意周配置
  for (let k = -1; k <= 7; k++) {
    const shiftedDayStart = baseShifted + k * DAY_MS
    const info = windowsOfDay(config, shiftedDayStart)

    if (k === 0) {
      todayWindows = info.windows.map(win => ({ start: win.start, end: win.end }))
      todayClosed = !!info.closed
    }
    if (info.override && info.override.message) {
      overrideMessage = info.override.message
    }

    for (const win of info.windows) {
      const startTs = shiftedDayStart + win.startMin * 60000 - BJ_OFFSET
      let endTs = shiftedDayStart + win.endMin * 60000 - BJ_OFFSET
      if (win.crossDay) endTs += DAY_MS

      if (!openInterval && nowTs >= startTs && nowTs < endTs) {
        openInterval = { startTs, endTs }
      }
      if (startTs > nowTs && (!nextOpen || startTs < nextOpen.startTs)) {
        nextOpen = { startTs, endTs }
      }
    }
  }

  const isOpen = !!openInterval
  const nowDate = formatBJ(nowTs).slice(0, 10)

  let reason = 'open'
  if (!isOpen) {
    if (todayClosed) {
      reason = 'holiday_closed'
    } else if (nextOpen && formatBJ(nextOpen.startTs).slice(0, 10) === nowDate) {
      reason = 'before_open'
    } else {
      reason = 'after_close'
    }
  }

  let message = ''
  if (!isOpen) {
    if (overrideMessage) {
      message = overrideMessage
    } else if (config.message) {
      message = config.message
    } else {
      message = '我们想打造一个纯绿色同校交友平台，一对一在线聊天室，起步阶段请师哥师姐输入你的邮箱，我们将在邮箱数达到200+时开放。我们有信心拿下第一座城池--长清大学城！'
    }
  }

  return {
    isOpen,
    enabled: true,
    reason,
    message,
    nextOpenTime: nextOpen ? nextOpen.startTs : null,
    nextCloseTime: openInterval ? openInterval.endTs : null,
    nextOpenTimeStr: nextOpen ? formatBJ(nextOpen.startTs).slice(11, 16) : '',
    nextOpenDateStr: nextOpen ? formatBJ(nextOpen.startTs).slice(0, 10) : '',
    todayWindowsText: todayWindows.map(win => `${win.start} - ${win.end}`).join('、'),
    todayWindows
  }
}

async function loadConfig() {
  try {
    const res = await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).get()
    if (res && res.data) {
      return res.data
    }
    return DEFAULT_CONFIG
  } catch (e) {
    // 集合或文档不存在：写入一份默认配置，方便后续直接在云开发控制台修改
    try {
      await ensureCollection()
      await db.collection(CONFIG_COLLECTION).add({
        data: Object.assign({}, DEFAULT_CONFIG, {
          _id: CONFIG_DOC_ID,
          remark: '每晚 21:00-23:00 开放。days: 1=周一 ... 7=周日；enabled=false 表示不限制；datesOverride 可做节假日特殊安排',
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        })
      })
      console.log('[getAppStatus] 已写入默认开放配置')
    } catch (err) {
      console.warn('[getAppStatus] 写入默认配置失败（可忽略，将使用内置默认值）:', err)
    }
    return DEFAULT_CONFIG
  }
}

exports.main = async (event = {}) => {
  const now = Date.now()

  // 非强制刷新时走短缓存
  if (!event.force && _cache.data && now - _cache.at < CACHE_TTL) {
    return Object.assign({}, _cache.data, {
      serverTime: now,
      serverTimeStr: formatBJ(now),
      cached: true
    })
  }

  const config = await loadConfig()
  const status = computeStatus(now, config)

  const result = Object.assign({
    code: 0,
    serverTime: now,
    serverTimeStr: formatBJ(now),
    cached: false
  }, status)

  _cache = { at: now, data: result }
  return result
}
