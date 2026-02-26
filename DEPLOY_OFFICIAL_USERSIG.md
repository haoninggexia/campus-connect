# 使用腾讯云官方库重新部署UserSig云函数

## 问题说明
之前自己实现的UserSig生成算法与腾讯云控制台不一致，导致登录失败（错误码70003）。现在改用腾讯云官方的UserSig生成库 `tls-sig-api-v2`。

## 步骤1：安装官方库

在本地终端运行：

```bash
cd d:\原C盘\桌面\wechat-im\cloudfunctions\getUserSig
npm install tls-sig-api-v2
```

## 步骤2：验证云函数代码

确认 `cloudfunctions/getUserSig/index.js` 的内容为：

```javascript
const TLSSigAPIv2 = require('tls-sig-api-v2')

// ⚠️ 替换为你在腾讯云IM控制台获取的配置
const SDKAppID = 1600125415
const privateKey = 'ea53910297332a32bd3a31a364588fce29b1d58c4ce340fe73befb4e62ee5485'

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
    // 使用腾讯云官方UserSig生成库
    const api = new TLSSigAPIv2.Api(SDKAppID, privateKey)

    // 设置UserSig过期时间（默认180天）
    const expireTime = expire || 180 * 86400

    // 生成UserSig
    const userSig = api.genUserSig(userID, expireTime)

    console.log('[DEBUG] UserSig生成成功，有效期:', expireTime, '秒')
    console.log('[DEBUG] UserSig长度:', userSig.length)
    console.log('[DEBUG] UserSig前50字符:', userSig.substring(0, 50))

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

## 步骤3：重新部署云函数

1. 在微信开发者工具中，右键点击 `cloudfunctions/getUserSig` 文件夹
2. 选择 **上传并部署：云端安装依赖**
3. 等待部署完成（注意：这次会安装 tls-sig-api-v2 依赖）

## 步骤4：本地测试验证

### 4.1 安装官方库

```bash
cd d:\原C盘\桌面\wechat-im
npm install tls-sig-api-v2
```

### 4.2 运行测试脚本

```bash
node test-usersig-official.js test_user_001
```

### 4.3 对比验证

1. 访问腾讯云IM控制台：https://console.cloud.tencent.com/im
2. 进入应用 -> 开发辅助工具 -> UserSig生成校验
3. 输入相同的UserID: `test_user_001`
4. 查看控制台生成的UserSig
5. 与本地脚本生成的UserSig对比

**使用官方库后，两者应该完全相同！**

## 步骤5：清除缓存并重新登录

1. 在微信开发者工具中：清除缓存 -> 清除全部缓存
2. 删除手机上的小程序
3. 重新编译
4. 重新登录

## 步骤6：查看日志

### 云函数日志
1. 打开云开发控制台
2. 进入 **云函数** 标签
3. 找到 `getUserSig` 云函数
4. 点击 **日志**
5. 查看是否有 `[DEBUG]` 开头的日志

### TIM SDK日志
1. 在微信开发者工具控制台中
2. 查找以下关键日志：
   - `TIM登录成功`
   - `TIM SDK准备就绪`

## 预期结果

如果一切正常，你应该看到：

### 云函数返回
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "userID": "wx_xxx_xxx",
    "userSig": "eJx...",
    "SDKAppID": 1600125415
  }
}
```

### TIM控制台日志
```
TIM SDK准备就绪
TIM登录成功 wx_xxx_xxx
```

## 如果仍然失败

### 检查1：云函数依赖是否安装成功
查看云函数日志，应该看到：
```
安装依赖成功：tls-sig-api-v2@2.x.x
```

### 检查2：密钥和SDKAppID是否正确
在腾讯云IM控制台确认：
- SDKAppID: `1600125415`
- 密钥: `ea53910297332a32bd3a31a364588fce29b1d58c4ce340fe73befb4e62ee5485`

### 检查3：UserSig是否过期
UserSig有效期现在是180天，不太可能过期。

### 检查4：TIM SDK版本
确保TIM SDK版本 >= 2.27.0

## 联系我

如果按照以上步骤操作后仍然失败，请提供：
1. 本地测试脚本输出的UserSig
2. 腾讯云控制台生成的UserSig
3. 云函数日志（特别是 `[ERROR]` 开头的行）
4. TIM SDK控制台的错误详情

我会进一步帮你分析问题！
