// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()
const _ = db.command

/**
 * 定时清理超时的聊天室
 * 每5分钟执行一次，清理超过3分钟未活动的房间
 */
exports.main = async (event, context) => {
  try {
    const now = Date.now()
    const timeoutThreshold = 3 * 60 * 1000 // 3分钟
    
    // 获取所有房间
    const result = await db.collection('chat_rooms').get()
    const rooms = result.data
    
    let cleanedCount = 0
    
    for (const room of rooms) {
      const lastActiveTime = new Date(room.lastActiveTime).getTime()
      const timeDiff = now - lastActiveTime
      
      // 如果超过3分钟未活动
      if (timeDiff > timeoutThreshold) {
        if (room.status === 1) {
          // 1人等待中，删除房间
          await db.collection('chat_rooms').doc(room._id).remove()
          cleanedCount++
        } else if (room.status === 2) {
          // 2人聊天中，清空用户和消息
          await db.collection('chat_rooms').doc(room._id).update({
            data: {
              user1: null,
              user2: null,
              status: 0,
              messages: [],
              lastActiveTime: db.serverDate()
            }
          })
          cleanedCount++
        }
      }
    }
    
    // 清理超时的在线状态记录（超过3分钟未心跳视为离线）
    try {
      const staleOnlineRes = await db.collection('online_users')
        .where({
          lastActiveTime: _.lt(new Date(Date.now() - timeoutThreshold))
        })
        .remove()
      const removedOnline = (staleOnlineRes.stats && staleOnlineRes.stats.removed) || 0
      console.log(`清理过期在线状态记录 ${removedOnline} 条`)
    } catch (e) {
      console.error('清理过期在线状态记录失败:', e)
    }

    return {
      code: 0,
      msg: `清理完成，共清理 ${cleanedCount} 个超时房间`
    }
  } catch (e) {
    console.error('清理超时房间失败:', e)
    return {
      code: -1,
      msg: '清理失败',
      error: e.message
    }
  }
}
