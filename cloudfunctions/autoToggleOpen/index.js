// 云函数入口文件：定时开关快照（方案 B 定时增强）
// 由同目录 config.json 里的 timer 触发器在每天 21:00 / 23:00 自动调用，
// 重新计算开放状态并写入 app_config，作为状态留痕 & 兜底。
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event = {}) => {
  console.log('[autoToggleOpen] 触发:', JSON.stringify(event))

  let status = null
  try {
    const res = await cloud.callFunction({
      name: 'getAppStatus',
      data: { force: true }
    })
    status = res && res.result
  } catch (e) {
    console.error('[autoToggleOpen] 调用 getAppStatus 失败:', e)
  }

  if (!status || status.code !== 0) {
    return { code: -1, msg: '获取开放状态失败' }
  }

  try {
    await db.collection('app_config').doc('open_time').update({
      data: {
        isOpen: status.isOpen,
        lastToggleReason: status.reason,
        lastToggleTime: db.serverDate(),
        lastToggleBy: event.TriggerName || 'manual',
        nextOpenTime: status.nextOpenTime,
        nextCloseTime: status.nextCloseTime,
        updateTime: db.serverDate()
      }
    })
  } catch (e) {
    console.warn('[autoToggleOpen] 写入状态快照失败（可忽略）:', e)
  }

  return {
    code: 0,
    isOpen: status.isOpen,
    reason: status.reason,
    serverTimeStr: status.serverTimeStr,
    nextOpenTime: status.nextOpenTime,
    nextCloseTime: status.nextCloseTime
  }
}
