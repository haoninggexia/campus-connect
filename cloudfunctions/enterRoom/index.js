// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()
const _ = db.command

// ---- 开放时间门禁（服务端兜底）----
async function getClosedStatus() {
  try {
    const res = await cloud.callFunction({ name: 'getAppStatus', data: {} })
    const status = (res && res.result) || null
    if (status && status.code === 0 && status.enabled && !status.isOpen) {
      return status
    }
  } catch (e) {
    console.warn('[gate] 开放状态检查失败，默认放行:', e)
  }
  return null
}

/**
 * 进入聊天室
 * 支持创建新房间或加入已有房间
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { roomId, university, userInfo } = event
  
  try {
    console.log('enterRoom收到参数:', { roomId, university, userInfo })

    // 开放时间强校验：未开放时拒绝创建 / 加入房间
    const closed = await getClosedStatus()
    if (closed) {
      return {
        code: 403,
        msg: closed.message || '当前不在开放时间',
        openStatus: closed
      }
    }

    // 检查用户性别是否已设置
    if (!userInfo.gender || (userInfo.gender !== '男' && userInfo.gender !== '女')) {
      console.log('用户未设置性别，拒绝操作')
      return { code: -1, msg: '请先在个人中心设置性别后再创建或加入房间' }
    }
    
    // 如果有roomId，尝试加入已有房间
    if (roomId) {
      const roomRes = await db.collection('chat_rooms').doc(roomId).get()
      const room = roomRes.data
      
      console.log('查询到的房间:', room)
      
      if (!room) {
        console.log('房间不存在')
        return { code: -1, msg: '房间不存在' }
      }
      
      // 检查房间状态
      if (room.status === 2) {
        console.log('房间已满，无法进入')
        return { code: -1, msg: '房间已满' }
      }
      
      // 检查用户是否已在房间中（修复：防止user2为null时报错）
      const isUserInRoom = (room.user1 && room.user1.userID === userInfo.userID) || 
                          (room.user2 && room.user2.userID === userInfo.userID)
      
      if (isUserInRoom) {
        console.log('用户已在房间中')
        return { code: -1, msg: '你已在房间中' }
      }
      
      // 检查是否超时（超过3分钟未活动）
      const now = Date.now()
      const lastActiveTime = new Date(room.lastActiveTime).getTime()
      if (now - lastActiveTime > 3 * 60 * 1000 && room.status === 1) {
        // 超时，重置房间
        await db.collection('chat_rooms').doc(roomId).update({
          data: {
            user1: null,
            status: 0,
            lastActiveTime: db.serverDate()
          }
        })
        console.log('房间已超时，已重置')
        return { code: -1, msg: '房间已超时，请重新创建' }
      }
      
      // 加入房间（第2个用户）
      console.log('用户加入房间:', userInfo)
      await db.collection('chat_rooms').doc(roomId).update({
        data: {
          user2: _.set(userInfo), // 使用set来替换null值
          status: 2,
          lastActiveTime: db.serverDate()
        }
      })
      
      console.log('加入成功')
      return {
        code: 0,
        msg: '加入成功',
        data: {
          roomId,
          status: 2,
          user1: room.user1,
          user2: userInfo
        }
      }
    } else {
      // 创建新房间
      const roomData = {
        university,
        status: 1, // 1人等待中
        user1: userInfo,
        user2: null,
        messages: [],
        createTime: db.serverDate(),
        lastActiveTime: db.serverDate()
      }
      
      const result = await db.collection('chat_rooms').add({
        data: roomData
      })
      
      return {
        code: 0,
        msg: '创建成功',
        data: {
          roomId: result._id,
          status: 1,
          user1: userInfo,
          user2: null
        }
      }
    }
  } catch (e) {
    console.error('进入聊天室失败:', e)
    return {
      code: -1,
      msg: '操作失败',
      error: e.message
    }
  }
}
