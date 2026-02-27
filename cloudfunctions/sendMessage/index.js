// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()
const _ = db.command

/**
 * 发送消息到聊天室
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { roomId, message } = event

  console.log('sendMessage收到参数:', { roomId, message })
  console.log('位置信息详情:', message.location)

  try {
    const msgData = {
      from: message.from,
      content: message.content,
      sendTime: new Date(),
      type: message.type || 'text'
    }

    // 如果有位置信息，添加到消息中
    if (message.location && message.location.latitude && message.location.longitude) {
      msgData.location = message.location
      console.log('位置信息已添加到消息:', msgData.location)
    } else {
      console.log('位置信息无效或不存在')
    }

    console.log('准备添加消息:', msgData)

    // 更新房间消息列表
    await db.collection('chat_rooms').doc(roomId).update({
      data: {
        messages: _.push(msgData),
        lastActiveTime: db.serverDate()
      }
    })

    console.log('消息发送成功')

    return {
      code: 0,
      msg: '发送成功'
    }
  } catch (e) {
    console.error('发送消息失败:', e)
    return {
      code: -1,
      msg: '发送失败',
      error: e.message
    }
  }
}
