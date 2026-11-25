// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

const MAX_NAME_LENGTH = 20

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

// ---- 房间名称内容安全检测（微信官方）----
async function checkNameSecure(openid, name) {
  try {
    const res = await cloud.openapi.security.msgSecCheck({
      version: 2,
      openid: openid,
      scene: 1, // 1 资料
      content: name
    })
    const suggest = (res && res.result && res.result.suggest) || ''
    console.log('[secCheck] 房间名称检测结果:', suggest)
    return suggest === 'pass'
  } catch (e) {
    console.error('[secCheck] 房间名称检测失败:', e)
    return false
  }
}

/**
 * 修改聊天室名称
 * 仅房间内成员（user1 / user2）可修改
 */
exports.main = async (event, context) => {
  const { roomId, roomName, userID } = event

  try {
    const closed = await getClosedStatus()
    if (closed) {
      return {
        code: 403,
        msg: closed.message || '当前不在开放时间',
        openStatus: closed
      }
    }

    const name = typeof roomName === 'string' ? roomName.trim() : ''
    if (!roomId || !name) {
      return { code: -1, msg: '请输入聊天室名称' }
    }
    if (name.length > MAX_NAME_LENGTH) {
      return { code: -1, msg: `聊天室名称不能超过 ${MAX_NAME_LENGTH} 个字符` }
    }

    const roomRes = await db.collection('chat_rooms').doc(roomId).get()
    const room = roomRes.data
    if (!room) {
      return { code: -1, msg: '房间不存在' }
    }

    const isMember =
      (room.user1 && String(room.user1.userID) === String(userID)) ||
      (room.user2 && String(room.user2.userID) === String(userID))
    if (!isMember) {
      return { code: 403, msg: '只有聊天室成员可以修改名称' }
    }

    const openid = cloud.getWXContext().OPENID
    const passed = await checkNameSecure(openid, name)
    if (!passed) {
      return { code: 4001, msg: '名称包含违规信息或检测服务异常，请修改后重试' }
    }

    await db.collection('chat_rooms').doc(roomId).update({
      data: {
        roomName: name,
        lastActiveTime: db.serverDate()
      }
    })

    return {
      code: 0,
      msg: '修改成功',
      data: { roomName: name }
    }
  } catch (e) {
    console.error('修改聊天室名称失败:', e)
    return {
      code: -1,
      msg: '修改失败',
      error: e.message
    }
  }
}
