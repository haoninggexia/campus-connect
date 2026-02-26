# 快速修复UserSig错误

## 问题
TIM登录失败，错误信息：
```
The UserSig in use is illegal. Please regenerate UserSig through official API.
```

## 原因
腾讯云IM需要有效的UserSig才能登录，不能使用 `userSig: '*'`。

## 解决方案

### 方案1：使用腾讯云在线工具（推荐，最快）

1. 访问腾讯云IM控制台：https://console.cloud.tencent.com/im/tool-usersig

2. 登录后，填写以下信息：
   - **SDKAppID**: 1600125415（你的应用ID）
   - **UserID**: user_001（或任何用户名）
   - **私钥**: 在控制台获取（步骤如下）
     - 访问：https://console.cloud.tencent.com/im
     - 点击你的应用 -> 应用配置
     - 找到"密钥"部分，复制"UserSig私钥"

3. 点击"生成签名"，复制生成的UserSig

4. 配置到项目中：
   ```javascript
   // 打开 utils/tim-config.js
   export default {
     SDKAppID: 1600125415,  // 从0改为你的SDKAppID
     UserSig: '复制的UserSig',  // 粘贴UserSig
   };
   ```

5. 重新编译小程序

---

### 方案2：使用本地生成脚本（更安全）

1. 安装依赖：
```bash
npm install
```

2. 编辑 `generate-usersig.js`，填入密钥：
```javascript
const SDKAPPID = 1600125415;
const USERID = 'user_001';
const KEY = '你的UserSig私钥'; // 从控制台获取
```

3. 生成UserSig：
```bash
npm run gen-usersig
```

4. 复制输出的UserSig到 `utils/tim-config.js`

5. 重新编译小程序

---

### 方案3：临时回退到WebSocket模式（本地测试）

如果暂时不想配置UserSig，可以回退到WebSocket模式：

1. 打开 `utils/tim-config.js`
2. 设置 `SDKAppID: 0`
3. 重新编译

**注意：** WebSocket模式只能在同一台电脑的模拟器中使用，无法实现跨设备通信。

---

## 配置步骤总结（使用腾讯云IM）

1. ✅ 在控制台获取SDKAppID和密钥
2. ✅ 使用在线工具或脚本生成UserSig
3. ✅ 配置 `utils/tim-config.js` 文件
4. ✅ 重新编译小程序
5. ✅ 在两台手机上扫码预览

## 重要提示

- **开发测试**：使用在线UserSig工具即可
- **正式环境**：必须在服务端生成UserSig，不要在前端暴露密钥
- **用户ID**：每个用户使用不同的UserID，格式如 `user_001`, `user_002`
- **UserSig有效期**：默认7天，过期后需重新生成

## 获取帮助

- 腾讯云IM文档：https://cloud.tencent.com/document/product/269/32688
- 在线UserSig工具：https://console.cloud.tencent.com/im/tool-usersig
- 技术交流群：点击文档中的"加入技术交流群"
