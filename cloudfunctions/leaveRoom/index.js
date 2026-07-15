// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

/**
 * 离开聊天室
 * status=1（仅创建者1人）：删除房间
 * status=2（2人聊天中）：保留剩余用户，房间变为status=1等待新用户加入
 */
exports.main = async (event, context) => {
  const { roomId, userID } = event
  
  try {
    const roomRes = await db.collection('chat_rooms').doc(roomId).get()
    const room = roomRes.data
    
    if (!room) {
      return { code: -1, msg: '房间不存在' }
    }
    
    // 如果房间只有1人，删除房间
    if (room.status === 1) {
      await db.collection('chat_rooms').doc(roomId).remove()
      return { code: 0, msg: '离开成功' }
    }
    
    // 如果房间有2人，保留剩余用户，状态变为等待中
    if (room.status === 2) {
      const isUser1 = room.user1 && room.user1.userID === userID
      const isUser2 = room.user2 && room.user2.userID === userID
      
      if (isUser1) {
        // 创建者(user1)离开，将user2提升为user1
        await db.collection('chat_rooms').doc(roomId).update({
          data: {
            user1: room.user2,
            user2: null,
            status: 1,
            messages: [],
            lastActiveTime: db.serverDate()
          }
        })
      } else if (isUser2) {
        // 加入者(user2)离开，保留user1
        await db.collection('chat_rooms').doc(roomId).update({
          data: {
            user2: null,
            status: 1,
            messages: [],
            lastActiveTime: db.serverDate()
          }
        })
      }
    }
    
    return { code: 0, msg: '离开成功' }
  } catch (e) {
    console.error('离开聊天室失败:', e)
    return {
      code: -1,
      msg: '离开失败',
      error: e.message
    }
  }
}
