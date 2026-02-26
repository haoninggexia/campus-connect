# UserSig不合法错误（70003）完整解决方案

## 错误信息
```
TIM登录失败 UserSig不合法
错误码: 70003
```

## 问题分析

UserSig不合法（错误码70003）的可能原因：
1. ✅ UserSig格式错误
2. ✅ 密钥（私钥）不正确
3. ✅ SDKAppID不匹配
4. ❌ JSON对象属性顺序不一致
5. ❌ 算法实现错误
6. ❌ 时间戳过期

## 解决步骤

### 步骤1：重新部署云函数

1. 在微信开发者工具中，右键点击 `cloudfunctions/getUserSig` 文件夹
2. 选择 **上传并部署：云端安装依赖**
3. 等待部署完成

### 步骤2：验证密钥和SDKAppID

在腾讯云IM控制台确认：
- SDKAppID: `1600125415`
- 密钥: `ea53910297332a32bd3a31a364588fce29b1d58c4ce340fe73befb4e62ee5485`

控制台地址：https://console.cloud.tencent.com/im

### 步骤3：本地测试UserSig生成

在终端运行：
```bash
cd d:\原C盘\桌面\wechat-im
node test-usersig.js wx_test_user_001
```

记下生成的UserSig。

### 步骤4：控制台对比验证

1. 访问腾讯云IM控制台
2. 进入应用 -> 开发辅助工具 -> UserSig生成校验
3. 输入UserID: `wx_test_user_001`
4. 查看生成的UserSig
5. 与本地测试脚本生成的UserSig对比

**如果相同**：说明算法正确，问题在别处
**如果不同**：说明算法有问题，需要调整

### 步骤5：清除缓存并重新登录

1. 在微信开发者工具中，点击菜单栏
2. 选择 **清除缓存** -> **清除全部缓存**
3. 删除手机上的小程序
4. 重新编译
5. 重新登录

### 步骤6：查看云函数日志

1. 打开云开发控制台
2. 进入 **云函数** 标签
3. 找到 `getUserSig` 云函数
4. 点击 **日志**
5. 查看详细日志输出，确认：
   - UserSig文档字符串
   - Base64编码
   - HMAC-SHA256签名
   - UserSig总长度

### 步骤7：查看TIM SDK日志

在微信开发者工具控制台中，查看TIM SDK的详细日志：
- 是否成功调用云函数
- 云函数返回的UserSig格式
- TIM.login()的错误详情

## 如果仍然失败

### 尝试方案1：使用腾讯云官方UserSig生成库

在云函数中安装腾讯云官方的UserSig生成库：

1. 修改 `cloudfunctions/getUserSig/package.json`，添加依赖：
```json
{
  "dependencies": {
    "wx-server-sdk": "~2.6.3",
    "tls-sig-api-v2": "^2.1.0"
  }
}
```

2. 修改 `cloudfunctions/getUserSig/index.js`：
```javascript
const TLSSigAPIv2 = require('tls-sig-api-v2')

const api = new TLSSigAPIv2.Api(
  1600125415,
  'ea53910297332a32bd3a31a364588fce29b1d58c4ce340fe73befb4e62ee5485'
)

const userSig = api.genUserSig(userID, 86400 * 180)
```

3. 重新部署云函数

### 尝试方案2：联系腾讯云技术支持

如果以上方案都无法解决问题，可能是以下原因：
- SDKAppID的密钥版本问题
- 腾讯云IM服务暂时异常
- TIM SDK版本问题

## 调试技巧

### 1. 打印云函数返回的UserSig

在 `pages/auth/auth.js` 中，第128行后添加：
```javascript
console.log('云函数返回UserSig:', result.data.userSig)
console.log('UserSig长度:', result.data.userSig.length)
```

### 2. 打印TIM登录参数

在 `libs/im-sdk/sdk/tim-handler-imp.js` 中，第72行后添加：
```javascript
console.log('[TIM登录] userID:', userInfo.userID)
console.log('[TIM登录] userSig前50字符:', userSigData.userSig.substring(0, 50))
console.log('[TIM登录] SDKAppID:', require('../../../utils/tim-config.js').default.SDKAppID)
```

### 3. 检查TIM初始化

在 `libs/im-sdk/sdk/tim-handler-imp.js` 中，第32-34行后添加：
```javascript
console.log('[TIM初始化] SDKAppID:', timConfig.SDKAppID)
console.log('[TIM初始化] SDKAppID类型:', typeof timConfig.SDKAppID)
```

## 常见问题

### Q1: UserSig长度应该是多少？
A: 通常在200-300个字符之间，取决于UserID长度和过期时间。

### Q2: UserSig有效期多久合适？
A: 建议7天（604800秒）或更长。太短会导致频繁过期。

### Q3: 为什么本地测试和控制台生成的UserSig不同？
A: 可能是算法实现错误，或JSON对象属性顺序不一致。

### Q4: 云函数日志在哪里查看？
A: 云开发控制台 -> 云函数 -> 选择函数 -> 日志

### Q5: 如何确认TIM SDK版本？
A: 在控制台中搜索 "TIM SDK版本"，应该显示类似 `2.27.6`

## 下一步

请按照以上步骤操作，并告诉我：
1. 本地测试脚本和控制台生成的UserSig是否相同？
2. 云函数日志中的调试信息是什么？
3. TIM SDK控制台的错误详情是什么？

根据这些信息，我可以进一步帮你定位问题。
