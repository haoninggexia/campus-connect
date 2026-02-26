# 腾讯云IM配置终极指南

## 当前状态
✅ 已回退到WebSocket本地模式，可以正常使用

## 腾云IM配置（实现跨设备通信）

### 前提条件
1. 已在腾讯云IM控制台创建应用
2. 获取到SDKAppID和UserSig私钥

---

## 第1步：确认你的SDKAppID和私钥

### 1.1 访问腾讯云IM控制台
https://console.cloud.tencent.com/im

### 1.2 查看你的应用信息
- 点击你的应用
- 记录 **SDKAppID**（例如：1600125415）
- 点击"应用配置"
- 复制 **UserSig私钥**（不要泄露给他人）

**重要：确保SDKAppID和私钥来自同一个应用！**

---

## 第2步：生成 user_001 的UserSig

### 2.1 访问UserSig生成工具
https://console.cloud.tencent.com/im/tool-usersig

### 2.2 填写以下信息（**精确复制**）

| 字段 | 值 |
|------|-----|
| SDKAppID | 1600125415（你的SDKAppID） |
| UserID | **user_001**（小写，带下划线） |
| 私钥 | 从控制台复制的UserSig私钥（完整复制） |

### 2.3 生成UserSig
1. 点击"生成签名"按钮
2. 等待2-3秒
3. 复制生成的UserSig（**完整复制**，不要遗漏任何字符）

### 2.4 配置到项目
打开 `utils/tim-config.js`，修改第20行：

```javascript
{
  userID: 'user_001',
  userSig: '粘贴刚才复制的UserSig',  // 完整粘贴
  nickName: '用户1'
}
```

---

## 第3步：生成 user_002 的UserSig

### 3.1 访问UserSig生成工具
https://console.cloud.tencent.com/im/tool-usersig

### 3.2 填写以下信息（**注意UserID不同**）

| 字段 | 值 |
|------|-----|
| SDKAppID | 1600125415（**同一个SDKAppID**） |
| UserID | **user_002**（注意：是002，不是001） |
| 私钥 | 从控制台复制的UserSig私钥（同一个私钥） |

### 3.3 生成UserSig
1. 点击"生成签名"按钮
2. 复制生成的UserSig（**完整复制**）

### 3.4 配置到项目
打开 `utils/tim-config.js`，修改第25行：

```javascript
{
  userID: 'user_002',
  userSig: '粘贴刚才复制的UserSig',  // 完整粘贴
  nickName: '用户2'
}
```

---

## 第4步：启用腾讯云IM

### 4.1 修改tim-config.js
将第13行修改为：

```javascript
SDKAppID: 1600125415,  // 从0改为你的SDKAppID
```

### 4.2 检查完整配置
`utils/tim-config.js` 应该是这样的：

```javascript
export default {
  SDKAppID: 1600125415,

  users: [
    {
      userID: 'user_001',
      userSig: 'user_001的UserSig...',  // 完整
      nickName: '用户1'
    },
    {
      userID: 'user_002',
      userSig: 'user_002的UserSig...',  // 完整
      nickName: '用户2'
    }
  ],

  currentUserIndex: 0,

  getCurrentUser() {
    return this.users[this.currentUserIndex];
  }
};
```

---

## 第5步：测试双手机通信

### 5.1 第一台手机配置
1. `utils/tim-config.js` 中设置 `currentUserIndex: 0`
2. 微信开发者工具点击"编译"
3. 手机扫码预览

### 5.2 第二台手机配置
1. 修改 `utils/tim-config.js` 中 `currentUserIndex: 1`
2. 微信开发者工具点击"编译"
3. 手机扫码预览

### 5.3 测试通信
1. 第一台手机发送"你好"给 user_002
2. 第二台手机应该收到消息
3. 第二台手机回复消息
4. 第一台手机应该收到回复

---

## 常见错误及解决

### 错误1：UserID does not match UserSig
```
The requested UserID(user_001) does not match the Usersig
```

**原因**：
- UserSig生成时使用的UserID与登录时的UserID不一致

**解决**：
1. 检查UserSig生成时UserID是否为 `user_001`（小写）
2. 检查登录时使用的UserID是否为 `user_001`
3. 两者必须完全一致（包括大小写）

### 错误2：SDKAppID不匹配
```
UserSig check failed for SDKAppID
```

**原因**：
- UserSig生成时使用的SDKAppID与登录时使用的不一致

**解决**：
1. 确保生成UserSig时的SDKAppID是 1600125415
2. 确保 `tim-config.js` 中的SDKAppID也是 1600125415
3. 两者必须完全一致

### 错误3：私钥错误
```
UserSig invalid
```

**原因**：
- UserSig私钥错误或过期

**解决**：
1. 重新在控制台获取私钥
2. 重新生成UserSig

---

## 快速检查清单

在启用TIM之前，确保：

- [ ] 已在腾讯云IM控制台创建应用
- [ ] SDKAppID已记录（例如：1600125415）
- [ ] 已获取UserSig私钥
- [ ] 已为 user_001 生成UserSig并粘贴到配置文件
- [ ] 已为 user_002 生成UserSig并粘贴到配置文件
- [ ] `SDKAppID` 已设置为非0值（你的SDKAppID）
- [ ] 两个UserSig都已完整粘贴（没有遗漏）
- [ ] userID为小写且包含下划线（user_001）

---

## 预期日志（成功登录）

编译后控制台应该看到：

```
TIM登录成功
TIM SDK准备就绪
IM实现方式: 腾讯云IM
当前登录用户: user_001
```

如果看到这个，说明TIM配置成功！

---

## 如果仍然失败

1. **检查日志中的登录用户**
   - 如果是随机ID（user_1771319507508），说明配置未生效
   - 应该是固定ID（user_001 或 user_002）

2. **检查UserSig是否复制完整**
   - UserSig应该很长（几百字符）
   - 确保没有遗漏末尾的字符

3. **尝试重新生成UserSig**
   - 使用新的私钥重新生成
   - 确保使用相同的SDKAppID和UserID

---

## 技术支持

- 腾讯云IM文档：https://cloud.tencent.com/document/product/269
- 在线UserSig工具：https://console.cloud.tencent.com/im/tool-usersig
- UserSig生成文档：https://cloud.tencent.com/document/product/269/32688

---

**下一步**：按照上述步骤配置UserSig，然后启用TIM（SDKAppID改为实际值），重新编译测试。
