// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

/**
 * 获取聊天室消息
 */
exports.main = async (event, context) => {
  const { roomId } = event
  
  try {
    const result = await db.collection('chat_rooms').doc(roomId).get()
    const room = result.data
    
    if (!room) {
      return { code: -1, msg: '房间不存在' }
    }
    
    // 为用户头像生成临时下载链接
    const processUser = async (user) => {
      if (!user) return user
      
      const processedUser = { ...user }
      
      // 如果有自定义头像，获取临时链接
      if (user.customAvatar) {
        try {
          const tempUrl = await cloud.getTempFileURL({
            fileList: [user.customAvatar]
          })
          if (tempUrl.fileList && tempUrl.fileList[0] && tempUrl.fileList[0].tempFileURL) {
            processedUser.customAvatarTemp = tempUrl.fileList[0].tempFileURL
          }
        } catch (e) {
          console.error('获取头像临时链接失败:', e)
        }
      }
      
      return processedUser
    }
    
    const [processedUser1, processedUser2] = await Promise.all([
      processUser(room.user1),
      processUser(room.user2)
    ])
    
    return {
      code: 0,
      msg: '获取成功',
      data: {
        messages: room.messages || [],
        status: room.status,
        user1: processedUser1,
        user2: processedUser2
      }
    }
  } catch (e) {
    console.error('获取消息失败:', e)
    return {
      code: -1,
      msg: '获取失败',
      error: e.message
    }
  }
}
