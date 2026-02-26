// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

/**
 * 离开聊天室
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
    
    // 如果房间有2人，清空用户
    if (room.status === 2) {
      await db.collection('chat_rooms').doc(roomId).update({
        data: {
          user1: null,
          user2: null,
          status: 0,
          messages: []
        }
      })
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
