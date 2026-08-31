// 云函数：用户在线状态心跳上报
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

/**
 * 用户在线心跳上报
 * 以 openid 作为文档 _id，不存在则创建、存在则更新 lastActiveTime
 * 60秒内有过心跳的用户视为在线
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { userID, nickName, avatarUrl } = event

  if (!openid) {
    return { code: -1, msg: '无法获取用户身份' }
  }

  try {
    await db.collection('online_users').doc(openid).set({
      data: {
        userID: userID || '',
        nickName: nickName || '',
        avatarUrl: avatarUrl || '',
        lastActiveTime: db.serverDate()
      }
    })

    return {
      code: 0,
      msg: '心跳上报成功'
    }
  } catch (e) {
    console.error('心跳上报失败:', e)
    return {
      code: -1,
      msg: '心跳上报失败',
      error: e.message
    }
  }
}
