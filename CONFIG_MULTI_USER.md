# 双手机通信配置指南

## 问题解决
✅ 已修复UserID与UserSig不匹配的问题

## 配置步骤

### 第1步：为第二台手机生成UserSig

1. 访问腾讯云IM UserSig生成工具：https://console.cloud.tencent.com/im/tool-usersig

2. 填写信息（**重要：使用 userID: user_002**）：
   - **SDKAppID**: 1600125415
   - **UserID**: `user_002`（注意：不是user_001）
   - **私钥**: 从控制台获取的UserSig私钥

3. 点击"生成签名"，复制生成的UserSig

### 第2步：配置第二台手机的UserSig

打开 `utils/tim-config.js`，找到 `user_002` 的配置：

```javascript
users: [
  {
    userID: 'user_001',  // 第一台手机
    userSig: 'eJyrVgrxCdYrSy1S...',  // 已配置
    nickName: '用户1'
  },
  {
    userID: 'user_002',  // 第二台手机
    userSig: '粘贴user_002的UserSig',  // 粘贴刚才生成的UserSig
    nickName: '用户2'
  }
],
```

### 第3步：设置每台手机的用户索引

#### 第一台手机：
打开 `utils/tim-config.js`，设置：
```javascript
currentUserIndex: 0,  // 使用user_001
```

#### 第二台手机：
打开 `utils/tim-config.js`，设置：
```javascript
currentUserIndex: 1,  // 使用user_002
```

### 第4步：测试通信

1. **编译小程序**：在微信开发者工具点击"编译"

2. **第一台手机扫码**：
   - 使用 currentUserIndex: 0（user_001）
   - 扫码预览

3. **第二台手机扫码**：
   - 修改 `currentUserIndex` 为 1（user_002）
   - 重新编译
   - 扫码预览

4. **开始聊天**：
   - 两台手机互相发送消息测试

---

## 快速切换用户方法

如果需要快速切换用户（用于测试），只需修改一个值：

```javascript
// utils/tim-config.js

// 第一台手机使用
currentUserIndex: 0,

// 第二台手机使用
currentUserIndex: 1,
```

修改后重新编译即可。

---

## 重要提示

⚠️ **每个userID需要独立的UserSig**
- user_001 的UserSig不能用于 user_002
- 必须分别为每个用户生成UserSig

⚠️ **两台手机必须使用不同的userID**
- 第一台：user_001
- 第二台：user_002

⚠️ **修改代码后要重新编译**
- 修改 tim-config.js 后必须点击"编译"
- 修改 currentUserIndex 后也要重新编译

---

## 故障排查

### 问题1：UserID不匹配
```
The requested UserID does not match UserSig
```
**解决**：确保使用的userID与生成UserSig时的userID一致

### 问题2：登录失败
```
TIM登录失败
```
**解决**：
1. 检查 SDKAppID 是否正确
2. 检查 UserSig 是否复制完整
3. 检查 currentUserIndex 是否正确

### 问题3：收不到消息
**解决**：
1. 确认两台手机都使用不同的userID
2. 确认两台手机都成功登录（查看控制台日志）
3. 确认使用的userID是对方的userID

---

## 完整示例配置

```javascript
// utils/tim-config.js

export default {
  SDKAppID: 1600125415,

  users: [
    {
      userID: 'user_001',
      userSig: 'user_001的UserSig...',
      nickName: '用户1'
    },
    {
      userID: 'user_002',
      userSig: 'user_002的UserSig...',
      nickName: '用户2'
    }
  ],

  currentUserIndex: 0,  // 第一台手机设为0，第二台设为1

  getCurrentUser() {
    return this.users[this.currentUserIndex];
  }
};
```

---

## 测试流程

1. ✅ 第一台手机登录 user_001
2. ✅ 第二台手机登录 user_002
3. ✅ 第一台发送消息给 user_002
4. ✅ 第二台收到消息
5. ✅ 第二台回复消息给 user_001
6. ✅ 第一台收到回复

完成！两台手机已实现跨设备通信。
