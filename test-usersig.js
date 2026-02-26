/**
 * 本地测试UserSig生成脚本
 * 用于验证云函数生成的UserSig是否正确
 *
 * 使用方法：
 * 1. 在腾讯云IM控制台生成一个UserSig（使用相同的userID和SDKAppID）
 * 2. 运行此脚本：node test-usersig.js <userID>
 * 3. 对比控制台生成的UserSig和本地生成的UserSig
 */

const crypto = require('crypto')

const SDKAppID = 1600125415
const privateKey = 'ea53910297332a32bd3a31a364588fce29b1d58c4ce340fe73befb4e62ee5485'

function genUserSig(userID, expire = 604800) {
  const currTime = Math.floor(Date.now() / 1000)

  // 构造UserSig内容
  const sigDocStr = JSON.stringify({
    'TLS.ver': '2.0',
    'TLS.identifier': userID,
    'TLS.sdkappid': SDKAppID,
    'TLS.expire': expire,
    'TLS.time': currTime
  })

  console.log('UserSig文档字符串:', sigDocStr)
  console.log('')

  // Base64编码
  const sigBase64 = Buffer.from(sigDocStr).toString('base64')
  console.log('Base64编码:', sigBase64)
  console.log('')

  // HMAC-SHA256签名
  const sig = crypto
    .createHmac('sha256', privateKey)
    .update(sigBase64)
    .digest('base64')

  console.log('HMAC-SHA256签名:', sig)
  console.log('')

  // 最终UserSig
  const userSig = `${sig}.${sigBase64}`
  console.log('UserSig长度:', userSig.length)
  console.log('')

  return userSig
}

// 从命令行获取userID
const userID = process.argv[2] || 'test_user_001'

console.log('========================================')
console.log('本地测试UserSig生成')
console.log('========================================')
console.log('SDKAppID:', SDKAppID)
console.log('UserID:', userID)
console.log('密钥长度:', privateKey.length)
console.log('========================================')
console.log('')

const userSig = genUserSig(userID)

console.log('========================================')
console.log('生成的UserSig:')
console.log(userSig)
console.log('========================================')
console.log('')
console.log('测试步骤:')
console.log('1. 访问腾讯云IM控制台: https://console.cloud.tencent.com/im')
console.log('2. 进入你的应用 -> 开发辅助工具 -> UserSig生成校验')
console.log('3. 输入相同的UserID:', userID)
console.log('4. 查看控制台生成的UserSig')
console.log('5. 与本脚本生成的UserSig进行对比')
console.log('6. 如果相同，说明算法正确；如果不同，需要调整')
