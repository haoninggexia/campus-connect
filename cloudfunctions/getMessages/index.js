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
      if (!user) {
        console.log('用户为空，跳过处理')
        return null
      }

      const processedUser = { ...user }

      console.log('处理用户头像，用户ID:', user.userID, '是否有自定义头像:', !!user.customAvatar, '自定义头像:', user.customAvatar)

      // 如果有自定义头像，获取临时链接
      if (user.customAvatar) {
        try {
          const tempUrl = await cloud.getTempFileURL({
            fileList: [user.customAvatar]
          })
          console.log('头像临时链接结果:', user.userID, tempUrl)

          if (tempUrl.fileList && tempUrl.fileList[0] && tempUrl.fileList[0].tempFileURL) {
            processedUser.customAvatarTemp = tempUrl.fileList[0].tempFileURL
            console.log('头像临时链接设置成功:', user.userID, processedUser.customAvatarTemp)
          } else {
            console.log('头像临时链接获取失败，返回数据:', tempUrl)
          }
        } catch (e) {
          console.error('获取头像临时链接失败:', user.userID, e)
        }
      } else {
        console.log('用户没有自定义头像:', user.userID)
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
