// 云函数：阿里云内容安全增强版 - 文本审核（第三方风控）
// 配合 sendMessage 使用，在微信官方检测之外增加一层独立风控
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { default: Green } = require('@alicloud/green20220302')
const { Config } = require('@alicloud/openapi-client')
const { RuntimeOptions } = require('@alicloud/tea-util')

// 接入点默认上海，可用环境变量 ALIYUN_GREEN_ENDPOINT 覆盖（如 green-cip.cn-beijing.aliyuncs.com）
const ENDPOINT = process.env.ALIYUN_GREEN_ENDPOINT || 'green-cip.cn-shanghai.aliyuncs.com'

function createClient() {
  const config = new Config({
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    endpoint: ENDPOINT
  })
  return new Green(config)
}

exports.main = async (event) => {
  const text = event && event.text
  if (!text || typeof text !== 'string') {
    return { pass: true, skipped: true, reason: 'empty' }
  }

  const ak = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID
  const sk = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET
  if (!ak || !sk) {
    console.warn('[aliSecCheck] 未配置阿里云 AccessKey，跳过检测')
    return { pass: true, skipped: true, reason: 'no_credentials' }
  }

  try {
    const client = createClient()
    const resp = await client.textModerationWithOptions({
      Service: event.service || 'chat_detection', // 私聊互动内容检测
      ServiceParameters: JSON.stringify({ content: text })
    }, new RuntimeOptions({}))

    const body = resp && resp.body
    const code = body && body.Code
    const data = body && body.Data

    // 兼容两种返回结构：Data.labels/riskLevel 或 Data.Result[]（增强版 Plus）
    let labels = ''
    let riskLevel = ''
    if (data) {
      if (typeof data === 'string') {
        labels = data
      } else {
        labels = data.labels || ''
        riskLevel = data.riskLevel || ''
        if (!labels && Array.isArray(data.Result) && data.Result[0]) {
          labels = data.Result.map(r => r.Label).join(',')
          riskLevel = data.Result[0].RiskLevel || riskLevel
        }
      }
    }

    const risky = code !== 200 ||
      (labels && String(labels).trim() !== '') ||
      riskLevel === 'high' || riskLevel === 'medium'

    console.log('[aliSecCheck]', JSON.stringify({ code, labels, riskLevel, risky }))
    return { pass: !risky, labels, riskLevel, code }
  } catch (e) {
    console.error('[aliSecCheck] 调用失败:', e)
    // 阿里云服务异常时保守放行，避免影响正常业务
    return { pass: true, skipped: true, reason: 'error', error: e.message }
  }
}
