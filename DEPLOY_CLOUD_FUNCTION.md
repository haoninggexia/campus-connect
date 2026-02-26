# 云函数重新部署步骤

## 步骤1：删除并重新上传云函数

1. 在微信开发者工具中，找到 `cloudfunctions/getUserSig` 文件夹
2. **右键点击** `getUserSig` 文件夹
3. 选择 **删除并重新安装** 或先右键选择 **删除**
4. 重新右键 `cloudfunctions` 文件夹
5. 选择 **新建Node.js云函数**
6. 输入名称：`getUserSig`

## 步骤2：复制代码

将以下内容复制到 `cloudfunctions/getUserSig/index.js` 文件中：

```javascript
const crypto = require('crypto')

// ⚠️ 替换为你在腾讯云IM控制台获取的配置
const SDKAppID = 1600125415
const privateKey = 'ea53910297332a32bd3a31a364588fce29b1d58c4ce340fe73befb4e62ee5485'

function genUserSig(userID, expire = 604800) {
  const currTime = Math.floor(Date.now() / 1000)

  const sigDoc = {
    'TLS.ver': '2.0',
    'TLS.identifier': userID,
    'TLS.sdkappid': parseInt(SDKAppID),
    'TLS.expire': parseInt(expire),
    'TLS.time': currTime
  }

  const sigStr = JSON.stringify(sigDoc)
  console.log('[DEBUG] UserSig文档:', sigStr)

  const sigBase64 = Buffer.from(sigStr).toString('base64')
  console.log('[DEBUG] Base64编码:', sigBase64)

  const sig = crypto
    .createHmac('sha256', privateKey)
    .update(sigBase64)
    .digest('base64')

  console.log('[DEBUG] HMAC-SHA256签名长度:', sig.length)

  const userSig = `${sig}.${sigBase64}`
  console.log('[DEBUG] UserSig总长度:', userSig.length)

  return userSig
}

exports.main = async (event, context) => {
  const { userID, expire } = event

  if (!userID) {
    return {
      code: 400,
      message: 'userID不能为空'
    }
  }

  console.log('[DEBUG] 生成UserSig，userID:', userID)

  try {
    const expireTime = expire || 604800
    const userSig = genUserSig(userID, expireTime)

    console.log('[DEBUG] UserSig生成成功，有效期:', expireTime, '秒')

    return {
      code: 0,
      message: 'success',
      data: {
        userID,
        userSig,
        SDKAppID: SDKAppID
      }
    }
  } catch (error) {
    console.error('[ERROR] 生成UserSig失败', error)
    return {
      code: 500,
      message: '生成UserSig失败',
      error: error.message
    }
  }
}
```

## 步骤3：配置云函数

1. 右键点击 `getUserSig` 文件夹
2. 选择 **上传并部署：云端安装依赖**
3. 等待部署完成

## 步骤4：测试云函数

1. 打开云开发控制台
2. 进入 **云函数** 标签
3. 找到 `getUserSig` 云函数
4. 点击 **测试**
5. 输入测试参数：
   ```json
   {
     "userID": "test_user_001"
   }
   ```
6. 点击 **运行**
7. 查看返回结果和日志

## 步骤5：清除缓存并重新登录

1. 在微信开发者工具中，点击 **清除缓存** -> **清除全部缓存**
2. 删除小程序
3. 重新编译
4. 重新登录

## 步骤6：查看日志

1. 打开云开发控制台
2. 进入 **云函数** 标签
3. 找到 `getUserSig` 云函数
4. 点击 **日志**
5. 查看详细日志输出
