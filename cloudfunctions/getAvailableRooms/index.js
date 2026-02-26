// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()
const _ = db.command

/**
 * 获取可用的聊天室列表
 * 按照大学分组，显示所有房间状态
 * 自动过滤掉超时的房间（超过3分钟未活动）
 */
exports.main = async (event, context) => {
  try {
    const { university } = event

    // 构建查询条件
    const whereCondition = university ? { university } : {}

    // 获取所有房间
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

    // 返回房间列表，状态会在前端处理
    return {
      code: 0,
      msg: '获取成功',
      data: validRooms
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
