  # 腾讯云IM配置指南

本指南将帮助你快速配置和启用腾讯云IM，将单机版聊天应用升级为支持多用户、跨设备的即时通讯应用。

## 📋 目录

- [快速开始](#快速开始)
- [详细配置步骤](#详细配置步骤)
- [生成UserSig](#生成usersig)
- [切换模式](#切换模式)
- [多用户测试](#多用户测试)
- [常见问题](#常见问题)

## 🚀 快速开始

### 前提条件

1. 拥有腾讯云账号
2. 已创建腾讯云IM应用
3. 了解Node.js基础（用于生成UserSig）

### 三步启用腾讯云IM

```bash
# 1. 配置SDKAppID和密钥
vim generate-usersig.js  # 修改SDKAPPID和KEY

# 2. 生成UserSig
node generate-usersig.js

# 3. 复制配置到tim-config.js
# 将生成的配置替换到 utils/tim-config.js 文件中
```

## 📝 详细配置步骤

### 步骤1：创建腾讯云IM应用

1. 访问[腾讯云IM控制台](https://console.cloud.tencent.com/im)
2. 点击"创建新应用"
3. 选择应用类型（推荐选择"即时通讯"）
4. 填写应用名称，如"同校交友"
5. 创建成功后，记录**SDKAppID**

### 步骤2：获取密钥

1. 在IM控制台中，点击刚创建的应用
2. 进入"应用配置"页面
3. 找到"密钥"部分
4. 复制"UserSig私钥"（这非常重要，请妥善保管）

### 步骤3：配置生成工具

编辑项目根目录下的 `generate-usersig.js` 文件：

```javascript
// ================== 配置区域 ==================
const SDKAPPID = 1600125415; // ⚠️ 替换为你的SDKAppID
const KEY = 'your-secret-key-here'; // ⚠️ 替换为你的密钥

// 定义需要生成UserSig的用户列表
const USERS = [
    { userID: 'user_001', nickName: '用户1' },
    { userID: 'user_002', nickName: '用户2' },
    { userID: 'user_003', nickName: '用户3' }
];
```

### 步骤4：生成UserSig

在项目根目录下运行：

```bash
node generate-usersig.js
```

执行成功后，你会看到类似输出：

```
================ UserSig生成工具（多用户版本） ================

当前配置：
SDKAppID: 1600125415
用户数量: 3
过期时间: 7 天

正在为用户生成UserSig...

✅ UserSig生成成功！

请将以下配置复制到 utils/tim-config.js 文件中：

```
  SDKAppID: 1600125415,  // 替换0为你的SDKAppID

  users: [
    {
      userID: 'user_001',
      userSig: 'eJwtzE0KwjAQhu...',
      nickName: '用户1'
    },
    {
      userID: 'user_002',
      userSig: 'eJwtzE0KwjAQhu...',
      nickName: '用户2'
    },
    {
      userID: 'user_003',
      userSig: 'eJwtzE0KwjAQhu...',
      nickName: '用户3'
    }
  ],
```
```

### 步骤5：应用配置

将上一步生成的配置，替换到 `utils/tim-config.js` 文件中：

```javascript
export default {
  // SDKAppID：设置为实际的腾讯云IM SDKAppID
  SDKAppID: 1600125415,  // ⚠️ 设置为你的SDKAppID

  // 用户配置列表
  users: [
    {
      userID: 'user_001',
      userSig: 'eJwtzE0KwjAQhu...',  // 替换为生成的UserSig
      nickName: '用户1'
    },
    {
      userID: 'user_002',
      userSig: 'eJwtzE0KwjAQhu...',  // 替换为生成的UserSig
      nickName: '用户2'
    },
    {
      userID: 'user_003',
      userSig: 'eJwtzE0KwjAQhu...',  // 替换为生成的UserSig
      nickName: '用户3'
    }
  ],

  // 当前使用的用户索引
  currentUserIndex: 0
};
```

## 🔧 生成UserSig

### UserSig是什么？

UserSig是腾讯云IM的用户登录凭证，相当于用户的"密码"。

### 为什么要生成UserSig？

每个用户ID需要对应一个UserSig才能登录腾讯云IM服务器。

### UserSig有效期

默认生成的UserSig有效期为**7天**，过期后需要重新生成。

### 修改有效期

如果需要修改UserSig的有效期，在 `generate-usersig.js` 中修改 `expire` 参数：

```javascript
function genUserSig(sdkappid, userId, key, expire = 7 * 24 * 3600) {
    // expire 单位是秒
    // 7天 = 7 * 24 * 3600 秒
    // 30天 = 30 * 24 * 3600 秒
}
```

## 🔄 切换模式

### 腾讯云IM模式 vs WebSocket本地模式

项目支持两种模式，通过 `utils/tim-config.js` 中的 `SDKAppID` 自动切换：

#### 1. 腾讯云IM模式（生产环境推荐）

```javascript
export default {
  SDKAppID: 1600125415,  // 设置为实际的SDKAppID
  // ... 其他配置
};
```

**特点：**
- ✅ 支持跨设备通信
- ✅ 支持离线消息
- ✅ 支持群聊
- ✅ 服务端消息存储
- ✅ 支持大规模用户

#### 2. WebSocket本地模式（开发测试）

```javascript
export default {
  SDKAppID: 0,  // 设置为0
  websocketUrl: 'ws://localhost:8001',
  // ... 其他配置
};
```

**特点：**
- ✅ 无需腾讯云账号
- ✅ 快速本地测试
- ⚠️ 仅支持同一设备
- ⚠️ 无离线消息
- ⚠️ 需要自己搭建WebSocket服务器

### 如何切换？

只需修改 `SDKAppID` 的值：
- `SDKAppID = 0` → WebSocket本地模式
- `SDKAppID = 实际值` → 腾讯云IM模式

项目会自动检测并选择合适的实现，无需修改其他代码。

## 👥 多用户测试

### 测试多用户聊天

在多台设备或模拟器上测试：

1. **第一台设备**
   ```javascript
   // utils/tim-config.js
   currentUserIndex: 0,  // 使用 user_001
   ```

2. **第二台设备**
   ```javascript
   // utils/tim-config.js
   currentUserIndex: 1,  // 使用 user_002
   ```

3. **第三台设备**
   ```javascript
   // utils/tim-config.js
   currentUserIndex: 2,  // 使用 user_003
   ```

### 使用微信开发者工具模拟多设备

1. 打开微信开发者工具
2. 点击"详情" → "本地设置"
3. 勾选"不校验合法域名、web-view（业务域名）、TLS版本以及HTTPS证书"
4. 在不同模拟器实例中运行小程序
5. 每个实例设置不同的 `currentUserIndex`

## ❓ 常见问题

### Q1: 登录失败，提示"UserSig无效"

**原因：** UserSig错误或过期

**解决方案：**
1. 检查 `tim-config.js` 中的 `userSig` 是否正确复制
2. 检查 UserSig 是否过期（有效期7天）
3. 重新运行 `node generate-usersig.js` 生成新的UserSig

### Q2: 找不到对方用户

**原因：** 腾讯云IM中用户需要先注册或导入

**解决方案：**
1. 确保所有用户都已使用对应的UserSig登录
2. 第一次使用时，用户会自动注册
3. 使用相同SDKAppID的用户可以互相发现

### Q3: 消息发送失败

**原因：** 网络问题或UserSig无效

**解决方案：**
1. 检查网络连接
2. 检查控制台是否有错误日志
3. 确认 `SDKAppID` 和 `userSig` 配置正确

### Q4: 无法切换到腾讯云IM模式

**原因：** `SDKAppID` 仍为 0

**解决方案：**
1. 确认 `tim-config.js` 中的 `SDKAppID` 已设置为实际值
2. 确认已将生成的 `userSig` 配置到对应的用户
3. 重新编译小程序

### Q5: 在真机上无法连接

**原因：** 域名未配置

**解决方案：**
1. 在腾讯云IM控制台配置小程序域名白名单
2. 或使用开发工具的"不校验合法域名"选项进行测试
3. 正式上线前需要在微信公众平台配置服务器域名

### Q6: UserSig生成失败

**原因：** 密钥错误或SDKAppID错误

**解决方案：**
1. 确认 `generate-usersig.js` 中的 `SDKAPPID` 正确
2. 确认 `KEY` 是完整的密钥字符串
3. 检查是否正确复制了"UserSig私钥"

## 📚 相关文档

- [腾讯云IM官方文档](https://cloud.tencent.com/document/product/269)
- [TIM SDK小程序集成指南](https://cloud.tencent.com/document/product/269/68438)
- [UserSig生成原理](https://cloud.tencent.com/document/product/269/32688)

## 🔒 安全建议

⚠️ **重要安全提示：**

1. **不要在前端暴露密钥**
   - 当前 `generate-usersig.js` 仅用于开发测试
   - 正式环境应在服务端生成UserSig

2. **UserSig定期更新**
   - 建议使用较短的过期时间（如7天）
   - 实现服务端UserSig生成接口

3. **HTTPS通信**
   - 正式上线必须使用HTTPS
   - 配置腾讯云IM服务器域名白名单

## 🎉 完成

配置完成后，你的应用已经支持：

- ✅ 多用户登录
- ✅ 跨设备通讯
- ✅ 离线消息
- ✅ 1对1私聊
- ✅ 即时通讯

下一步可以继续实现好友系统、群组系统等功能。
