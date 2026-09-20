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

// ---- 微信官方内容安全 API ----

/**
 * 文本内容安全检测（同步）：security.msgSecCheck 2.0
 * @returns {Promise<{pass: boolean, suggest?: string}>}
 */
async function checkText(openid, content) {
  try {
    const res = await cloud.openapi.security.msgSecCheck({
      version: 2,
      openid: openid, // 用户需在近两小时访问过小程序
      scene: 2, // 1 资料 2 评论 3 论坛 4 社交日志
      content: String(content || '')
    })
    const suggest = (res && res.result && res.result.suggest) || ''
    console.log('[secCheck] msgSecCheck 结果:', JSON.stringify(res && res.result))
    return { pass: suggest === 'pass', suggest: suggest }
  } catch (e) {
    console.error('[secCheck] msgSecCheck 调用失败:', e)
    // 检测服务异常时保守处理：拒绝发送，避免漏放违规内容
    return { pass: false, error: true }
  }
}

/**
 * 多媒体内容安全检测（异步提交）：security.mediaCheckAsync 2.0
 * 检测结果由微信服务器异步推送到 secCheckCallback 云函数
 * @returns {Promise<string>} traceId 用于回调时定位消息
 */
async function submitMediaCheck(openid, fileID, mediaType) {
  // mediaCheckAsync 需要公网可访问的 url，先生成临时链接
  const res = await cloud.getTempFileURL({ fileList: [fileID] })
  const item = res && res.fileList && res.fileList[0]
  if (!item || !item.tempFileURL) {
    throw new Error('临时链接获取失败')
  }
  const checkRes = await cloud.openapi.security.mediaCheckAsync({
    version: 2,
    openid: openid,
    scene: 2, // 评论场景
    media_url: item.tempFileURL,
    media_type: mediaType // 1 音频（100ms~60s）；2 图片（≤10M）
  })
  if (!checkRes || !checkRes.traceId) {
    throw new Error('mediaCheckAsync 未返回 traceId: ' + JSON.stringify(checkRes))
  }
  console.log('[secCheck] mediaCheckAsync 已提交, traceId:', checkRes.traceId)
  return checkRes.traceId
}

/**
 * 发送消息到聊天室
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { roomId, message } = event

  console.log('sendMessage收到参数:', { roomId, message })
  console.log('位置信息详情:', message.location)

  try {
    // 开放时间强校验：未开放时拒绝发送消息
    const closed = await getClosedStatus()
    if (closed) {
      return {
        code: 403,
        msg: closed.message || '当前不在开放时间',
        openStatus: closed
      }
    }

    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    // ---- 内容安全检测 ----
    let traceId = null

    if (message.type === 'text') {
      // 文本：同步检测，不通过直接拒绝
      const check = await checkText(openid, message.content)
      if (!check.pass) {
        return {
          code: 4001,
          msg: check.error ? '内容安全检测服务异常，请稍后再试' : '内容包含违规信息，无法发送'
        }
      }
    } else if (message.type === 'image' || message.type === 'voice') {
      // 图片/语音：提交异步检测，先入库标记 checking，违规结果由回调清除
      try {
        traceId = await submitMediaCheck(openid, message.content, message.type === 'voice' ? 1 : 2)
      } catch (e) {
        console.error('[secCheck] mediaCheckAsync 提交失败:', e)
        // 删除刚上传的文件，避免未检测文件残留
        try { await cloud.deleteFile({ fileList: [message.content] }) } catch (_) {}
        return {
          code: 4002,
          msg: '内容安全检测提交失败，请稍后再试'
        }
      }
    }

    const msgData = {
      from: message.from,
      content: message.content,
      sendTime: new Date(),
      type: message.type || 'text'
    }

    // 语音消息：保存时长（秒）
    if (message.type === 'voice' && message.duration) {
      msgData.duration = Math.max(1, Math.round(message.duration))
    }

    // 异步审核中的媒体消息：记录审核状态与 traceId，供回调定位
    if (traceId) {
      msgData.secStatus = 'checking'
      msgData.traceId = traceId
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
