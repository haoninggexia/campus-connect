# 完善即时通讯功能 - 完整指南

## 当前状态

### ✅ 已完成的功能
- ✅ 用户登录
- ✅ 搜索用户
- ✅ 添加/删除好友
- ✅ 聊天页面UI
- ✅ TIM SDK集成
- ✅ 消息发送接收代码

### ⚠️ 需要完善的功能
- ⚠️ TIM WebSocket连接（域名配置）
- ⚠️ 实时消息收发
- ⚠️ 消息历史记录

## 第一步：配置WebSocket域名（必须）

### 问题说明
当前TIM无法连接，错误信息：
```
SocketHandler._onError {"errMsg":"fail:url not in domain list"}
```

这是因为微信小程序需要配置WebSocket域名白名单。

### 配置步骤

#### 1. 登录微信公众平台
- 访问：https://mp.weixin.qq.com
- 使用小程序管理员账号登录

#### 2. 进入小程序后台
- 点击"开发" → "开发管理" → "开发设置"

#### 3. 配置服务器域名
- 找到"服务器域名"部分
- 在"socket合法域名"中添加以下域名：
  ```
  wss://wss.im.qcloud.com
  ```

#### 4. 保存并等待生效
- 点击"保存"按钮
- 域名配置通常需要几分钟到几小时生效
- 也可以选择"立即生效"，但可能需要审核

#### 5. 验证配置
配置生效后，在微信开发者工具中：
- 点击"详情" → "本地设置"
- 勾选"不校验合法域名..."（仅开发调试用）

## 第二步：验证TIM连接

### 方法1：查看控制台日志

重新编译小程序后，查看控制台，应该看到：

**成功的日志：**
```
TIMHandlerImp.createConnection被调用
初始化TIM，SDKAppID: 1600125415
TIM实例创建成功
TIM事件监听器已设置
开始登录TIM...
TIM登录成功 wx_xxx_xxx
TIM SDK准备就绪
```

**失败的日志：**
```
SocketHandler._onError {"errMsg":"fail:url not in domain list"}
```

### 方法2：检查TIM状态

在浏览器控制台或小程序控制台运行：
```javascript
const app = getApp();
console.log('IM Handler:', app.appIMDelegate?.imHandler);
console.log('是否登录:', app.appIMDelegate?.imHandler?._isLogin);
console.log('是否初始化:', app.appIMDelegate?.imHandler?._initialized);
```

### 方法3：查看网络请求

1. 打开微信开发者工具的"网络"面板
2. 筛选"Socket"
3. 应该能看到到 `wss.im.qcloud.com` 的WebSocket连接

## 第三步：测试聊天功能

### 测试前准备

1. **确认两台设备都已登录**
   - 设备A和设备B都已成功登录
   - TIM都成功连接

2. **确认两台设备已互为好友**
   - 设备A添加设备B为好友
   - 设备B添加设备A为好友

### 测试步骤

#### 设备A发送消息给设备B

1. 在设备A的"我的好友"列表中，找到设备B
2. 点击设备B → 点击"💬 聊天"
3. 进入聊天页面，输入消息（如："你好"）
4. 点击发送

**预期结果：**
- ✅ 设备A的消息立即显示在聊天界面
- ✅ 设备B收到新消息通知（如果在前台应该立即显示）

#### 设备B接收并回复消息

1. 设备B应该看到来自设备A的消息
2. 点击消息或进入聊天页面
3. 输入回复消息
4. 点击发送

**预期结果：**
- ✅ 设备B的消息立即显示
- ✅ 设备A收到设备B的回复

### 功能验证清单

- [ ] 设备A能发送消息
- [ ] 设备B能接收设备A的消息
- [ ] 设备B能回复消息
- [ ] 设备A能接收设备B的回复
- [ ] 消息显示正确（发送/接收状态）
- [ ] 时间显示正确
- [ ] 头像显示正确
- [ ] 聊天记录保留

## 第四步：排查问题

### 问题1：TIM连接失败

**症状：**
```
SocketHandler._onError {"errMsg":"fail:url not in domain list"}
```

**解决方案：**
1. 确认已配置WebSocket域名：`wss://wss.im.qcloud.com`
2. 检查域名是否已生效
3. 清除缓存重新编译：工具 → 清缓存 → 全部清除
4. 重新登录尝试

### 问题2：登录失败

**症状：**
```
TIM登录失败 Error: ...
```

**可能原因：**
- UserSig过期或无效
- 网络连接问题
- SDKAppID配置错误

**解决方案：**
1. 检查UserSig是否有效（有效期24小时）
2. 如果UserSig过期，重新登录获取新的UserSig
3. 检查 `utils/tim-config.js` 中的SDKAppID是否正确
4. 查看云函数 `getUserSig` 日志

### 问题3：发送消息失败

**症状：**
发送消息后显示"发送失败"

**可能原因：**
- TIM未连接成功
- 对方用户ID错误
- 网络问题

**解决方案：**
1. 确认TIM已连接（控制台有"TIM登录成功"日志）
2. 检查好友的用户ID是否正确
3. 检查对方是否在线
4. 查看控制台详细错误信息

### 问题4：接收不到消息

**症状：**
对方发送了消息，但我收不到

**可能原因：**
- 消息监听未设置
- 前端过滤了非当前聊天对象的消息
- 网络问题

**解决方案：**
1. 确认消息监听已设置（`setupMessageListener` 已调用）
2. 检查 `msg.from` 是否匹配当前聊天对象的 `friendID`
3. 查看控制台是否有"收到TIM消息"日志
4. 确保应用在前台或后台运行

### 问题5：消息显示错误

**症状：**
- 消息时间不正确
- 头像不显示
- 消息内容异常

**解决方案：**
1. 检查 `formatTime` 函数是否正确
2. 检查头像URL是否有效
3. 检查消息类型和内容是否正确解析
4. 查看 `_convertTIMMessage` 函数

## 第五步：优化建议

### 1. 添加消息发送状态

在 `chat-tim.js` 中，添加消息发送状态（发送中/成功/失败）：

```javascript
addMessage(message) {
  // 添加状态字段
  message.status = message.status || 'sending'; // sending, success, failed
  message.timeStr = this.formatTime(message.time || Date.now());
  const messages = this.data.messages.concat(message);
  this.setData({ messages });
  this.scrollToBottom();
}
```

### 2. 添加消息重发功能

发送失败时，显示重发按钮：

```javascript
onRetrySend(e) {
  const msgIndex = e.currentTarget.dataset.index;
  const msg = this.data.messages[msgIndex];
  // 重新发送该消息
  this.resendMessage(msg);
}
```

### 3. 添加已读回执

显示对方是否已读消息：

```javascript
// TIM SDK支持已读回执
this._tim.setMessageRead({ conversationID: convID });
```

### 4. 添加表情功能

支持发送表情：

```javascript
// 使用自定义消息类型
message = this._tim.createCustomMessage({
  to: this.data.friendID,
  conversationType: TIM.TYPES.CONV_C2C,
  payload: {
    data: 'emoji',
    description: emojiCode,
    extension: ''
  }
});
```

### 5. 添加图片消息

支持发送和接收图片：

```javascript
// 发送图片
wx.chooseImage({
  count: 1,
  success: (res) => {
    const tempFilePath = res.tempFilePaths[0];
    message = this._tim.createImageMessage({
      to: this.data.friendID,
      conversationType: TIM.TYPES.CONV_C2C,
      payload: {
        file: tempFilePath
      }
    });
    this._tim.sendMessage(message);
  }
});
```

### 6. 添加语音消息

支持发送和接收语音：

```javascript
// 录音
wx.startRecord({
  success: (res) => {
    const tempFilePath = res.tempFilePath;
    // 获取语音时长
    wx.getFileInfo({
      filePath: tempFilePath,
      success: (fileInfo) => {
        // 发送语音消息
      }
    });
  }
});
```

## 第六步：调试技巧

### 查看TIM日志

在 `tim-handler-imp.js` 中，日志级别设置为 1（release）：

```javascript
this._tim.setLogLevel(1); // 0: 普通级别, 1: release级别, 2: warn级别, 3: error级别, 4: 无日志
```

### 监听所有TIM事件

```javascript
this._tim.on(TIM.EVENT.SDK_READY, (event) => {
  console.log('SDK_READY', event);
});
this._tim.on(TIM.EVENT.MESSAGE_RECEIVED, (event) => {
  console.log('MESSAGE_RECEIVED', event);
});
this._tim.on(TIM.EVENT.ERROR, (event) => {
  console.log('ERROR', event);
});
this._tim.on(TIM.EVENT.KICKED_OUT, (event) => {
  console.log('KICKED_OUT', event);
});
this._tim.on(TIM.EVENT.NET_STATE_CHANGE, (event) => {
  console.log('NET_STATE_CHANGE', event);
});
this._tim.on(TIM.EVENT.CONVERSATION_LIST_UPDATED, (event) => {
  console.log('CONVERSATION_LIST_UPDATED', event);
});
```

### 使用TIM调试工具

腾讯云IM控制台提供在线调试工具：
https://console.cloud.tencent.com/im

## 第七步：常见问题FAQ

### Q: WebSocket域名配置多久生效？
A: 通常需要几分钟到几小时，选择"立即生效"可能需要审核。

### Q: UserSig有效期多久？
A: 默认24小时，过期需要重新登录获取新的UserSig。

### Q: 如何查看历史消息？
A: TIM SDK提供 `getMessageList` API，可以获取历史消息。

### Q: 能否实现群聊？
A: 可以，TIM SDK支持群聊，有相关API：`createGroup`、`joinGroup`。

### Q: 消息会被保存多久？
A: 根据腾讯云IM套餐不同，保存时间不同，基础版通常保存7天。

### Q: 如何防止消息丢失？
A: 使用离线消息功能，TIM SDK会自动缓存离线期间的消息。

## 第八步：完成检查

完成所有配置后，请确认：

- [ ] WebSocket域名已配置并生效
- [ ] TIM成功连接（控制台有"TIM登录成功"日志）
- [ ] 能发送消息
- [ ] 能接收消息
- [ ] 消息显示正确
- [ ] 头像显示正确
- [ ] 时间显示正确

## 下一步

完成即时通讯功能后，可以考虑：

1. 添加群聊功能
2. 添加消息已读回执
3. 添加表情和图片消息
4. 添加语音消息
5. 添加消息撤回功能
6. 添加消息转发功能

## 获取帮助

如果按照本指南仍然无法解决问题：

1. 查看腾讯云IM官方文档：https://cloud.tencent.com/document/product/269
2. 查看TIM SDK API文档：https://web.sdk.qcloud.com/im/doc/zh-cn/SDK.html
3. 在控制台查看详细错误日志
4. 检查云函数日志

---

**祝您顺利完成即时通讯功能的开发！** 🎉
