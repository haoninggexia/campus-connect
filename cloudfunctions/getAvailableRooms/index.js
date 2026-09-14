// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()
const _ = db.command

// ---- 开放时间门禁（服务端兜底）----
// 复用 getAppStatus 的判定逻辑，本函数内部做 10 秒缓存，避免 3 秒轮询放大调用量
let _statusCache = { at: 0, status: null }
const STATUS_CACHE_TTL = 10 * 1000

async function getOpenStatus() {
  const now = Date.now()
  if (_statusCache.status && now - _statusCache.at < STATUS_CACHE_TTL) {
    return _statusCache.status
  }
  try {
    const res = await cloud.callFunction({ name: 'getAppStatus', data: {} })
    const status = (res && res.result) || null
    if (status && status.code === 0) {
      _statusCache = { at: now, status }
      return status
    }
  } catch (e) {
    console.warn('[gate] 获取开放状态失败，沿用上次结果或默认放行:', e)
  }
  return _statusCache.status
}

/**
 * 获取可用的聊天室列表
 * 只返回 status === 1 的房间（有且仅有1人等待中，可加入）
 * 自动过滤掉超时的房间（超过3分钟未活动）
 */
exports.main = async (event, context) => {
  try {
    const { university } = event

    // 开放时间兜底：未开放时直接返回空列表 + 状态，前端据此弹窗并返回状态页
    const openStatus = await getOpenStatus()
    if (openStatus && openStatus.enabled && !openStatus.isOpen) {
      return {
        code: 0,
        msg: '当前未开放',
        isOpen: false,
        closedMessage: openStatus.message,
        openStatus,
        data: [],
        onlineCount: 0
      }
    }

    // 构建查询条件：只查询 status === 1 的房间（有且仅有1人等待中）
    const whereCondition = {
      status: 1
    }
    if (university) {
      whereCondition.university = university
    }

    // 获取所有等待中的房间
    const result = await db.collection('chat_rooms')
      .where(whereCondition)
      .orderBy('createTime', 'desc')
      .get()

    const rooms = result.data

    // 过滤掉已超时的房间（超过3分钟未活动）
    const now = Date.now()
    const timeoutThreshold = 3 * 60 * 1000 // 3分钟
    const validRooms = rooms.filter(room => {
      const lastActiveTime = new Date(room.lastActiveTime).getTime()
      const timeDiff = now - lastActiveTime

      // 超时的房间不返回
      return timeDiff <= timeoutThreshold
    })

    console.log(`获取到 ${rooms.length} 个房间，过滤后剩余 ${validRooms.length} 个有效房间`)

    // 统计实时在线人数（60秒内有过心跳的用户）
    const onlineThreshold = 60 * 1000 // 60秒
    let onlineCount = 0
    try {
      const onlineRes = await db.collection('online_users')
        .where({
          lastActiveTime: _.gt(new Date(Date.now() - onlineThreshold))
        })
        .count()
      onlineCount = onlineRes.total || 0
    } catch (e) {
      console.error('统计在线人数失败:', e)
    }

    // 返回房间列表，状态会在前端处理
    return {
      code: 0,
      msg: '获取成功',
      isOpen: true,
      openStatus: openStatus || null,
      data: validRooms,
      onlineCount
    }
  } catch (e) {
    console.error('获取聊天室列表失败:', e)
    return {
      code: -1,
      msg: '获取失败',
      error: e.message
    }
  }
}
