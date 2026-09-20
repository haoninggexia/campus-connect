// 云函数：接收微信内容安全异步检测结果推送（wxa_media_check）
//
// 支持两种接入方式：
// 【方式一】云开发控制台 → 消息推送 → 推送模式选「云函数」（event 即推送内容）
// 【方式二】公众平台消息推送 + 云开发「HTTP 访问服务」映射到本函数（推荐，兼容性最好）
//           URL: https://{envId}.service.tcloudbase.com/seccheck
//           该方式下本函数还需响应微信的 GET Token 校验（返回 echostr）
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

// 与公众平台「消息推送配置」页面填写的 Token 保持一致（英文或数字，3-32 位）
const MSG_PUSH_TOKEN = 'wechatIMsecCheck2026'

/**
 * 校验微信服务器推送的签名（明文模式）
 */
function checkSignature(signature, timestamp, nonce) {
  if (!signature || !timestamp || !nonce) return false
  const arr = [MSG_PUSH_TOKEN, timestamp, nonce].sort()
  const sha1 = crypto.createHash('sha1').update(arr.join('')).digest('hex')
  return sha1 === signature
}

/**
 * HTTP 触发方式的统一响应
 */
function httpResponse(statusCode, body) {
  return {
    statusCode: statusCode,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    },
    body: body
  }
}

/**
 * 处理检测结果：定位消息 -> 标记审核状态 -> 删除违规媒体文件
 */
async function handleMediaCheckResult(traceId, suggest) {
  // pass 放行；review（疑似待人工复核）与 risky（违规）均按违规处理，保守合规
  const secStatus = suggest === 'pass' ? 'pass' : 'risky'
  console.log('[secCheckCallback] traceId:', traceId, 'suggest:', suggest, '->', secStatus)

  // 定位包含该 traceId 消息的房间（messages 为内嵌数组）
  const rooms = await db.collection('chat_rooms').where({
    'messages.traceId': traceId
  }).get()

  for (const room of rooms.data) {
    let changed = false
    const deleteFiles = []
    const messages = (room.messages || []).map((m) => {
      if (m && m.traceId === traceId) {
        changed = true
        // 违规的媒体文件从云存储删除，防止链接外泄
        if (secStatus === 'risky' && m.content && typeof m.content === 'string' && m.content.indexOf('cloud://') === 0) {
          deleteFiles.push(m.content)
        }
        return { ...m, secStatus: secStatus }
      }
      return m
    })

    if (changed) {
      await db.collection('chat_rooms').doc(room._id).update({
        data: { messages: messages }
      })
      console.log('[secCheckCallback] 已更新房间:', room._id, 'secStatus:', secStatus)
    }

    if (deleteFiles.length > 0) {
      try {
        await cloud.deleteFile({ fileList: deleteFiles })
        console.log('[secCheckCallback] 已删除违规文件:', deleteFiles)
      } catch (e) {
        console.error('[secCheckCallback] 删除违规文件失败:', e)
      }
    }
  }
}

/**
 * 解析推送数据，返回 { eventName, traceId, suggest }
 */
function parsePushData(data) {
  if (!data || typeof data !== 'object') return {}
  const eventName = data.Event || data.eventType || ''
  const traceId = data.trace_id || data.traceId
  const result = data.result || {}
  return { eventName: eventName, traceId: traceId, suggest: result.suggest || '' }
}

exports.main = async (event, context) => {
  console.log('[secCheckCallback] 收到调用:', JSON.stringify(event))

  // ---------- 方式二：HTTP 访问服务（GET Token 校验）----------
  if (event && event.httpMethod) {
    const params = event.queryStringParameters || {}

    if (event.httpMethod.toUpperCase() === 'GET') {
      const ok = checkSignature(params.signature, params.timestamp, params.nonce)
      if (ok) {
        console.log('[secCheckCallback] Token 校验通过')
        return httpResponse(200, params.echostr || 'success')
      }
      console.error('[secCheckCallback] Token 校验失败')
      return httpResponse(200, 'fail')
    }

    // POST：推送检测结果
    let payload = null
    try {
      const raw = event.isBase64Encoded && event.body
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body
      payload = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (e) {
      console.error('[secCheckCallback] 解析推送 body 失败:', e, event.body)
      return httpResponse(200, 'success')
    }

    const { eventName, traceId, suggest } = parsePushData(payload)
    if (eventName === 'wxa_media_check' && traceId) {
      await handleMediaCheckResult(traceId, suggest)
    }
    return httpResponse(200, 'success')
  }

  // ---------- 方式一：云开发控制台「云函数消息推送」----------
  const { eventName, traceId, suggest } = parsePushData(event)
  if (eventName !== 'wxa_media_check' || !traceId) {
    return 'ignored'
  }
  await handleMediaCheckResult(traceId, suggest)
  return 'ok'
}
