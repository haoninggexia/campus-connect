# Step 6：安装TIM SDK

## ⚠️ 重要：需要手动执行npm install

由于npm安装可能需要较长时间，请在终端手动执行以下命令：

### 1. 打开终端
在微信开发者工具中，点击「终端」→「新建终端」

### 2. 安装TIM SDK
```bash
npm install --save tim-js-sdk
```

### 3. 等待安装完成
安装时间约30秒-2分钟，根据网络情况而定。

## ✅ 已完成的改造

### 1. 改造 TIMHandlerImp (libs/im-sdk/sdk/tim-handler-imp.js)
- ✅ 使用tim-js-sdk替代tim-wx-sdk
- ✅ 从缓存读取用户信息和UserSig（云函数生成）
- ✅ 添加登录过期检测和自动重新登录
- ✅ 添加被踢出检测
- ✅ 实现消息发送（文字、图片、语音）
- ✅ 实现会话列表获取
- ✅ 实现群组创建和加入

### 2. 修改 IM Factory (libs/im-sdk/im-factory.js)
- ✅ 从WebSocketHandlerImp切换到TIMHandlerImp
- ✅ 统一接口，保持向后兼容

### 3. 改造 App Delegate (delegate/app-im-delegate.js)
- ✅ 添加登录状态检查
- ✅ 只有在用户登录后才创建TIM连接
- ✅ 避免未登录时的错误

## 🧪 测试步骤

安装完TIM SDK后，可以进行以下测试：

1. **编译项目**
   - 点击「编译」按钮

2. **查看TIM初始化**
   - 打开控制台（Console）
   - 应该看到「初始化TIM，SDKAppID: 1600125415」
   - 登录后应该看到「TIM登录成功」

3. **测试消息发送**
   - 需要两个账号互相发送消息测试
   - 可以使用两个不同的微信号登录

## ⚠️ 常见问题

### Q：npm install失败？
A：检查网络连接，或尝试使用淘宝镜像：
```bash
npm install --save tim-js-sdk --registry=https://registry.npmmirror.com
```

### Q：编译时报错找不到TIM？
A：确认npm install执行成功，可以检查package.json中是否有tim-js-sdk依赖

### Q：TIM登录失败？
A：
1. 检查云函数getUserSig是否部署成功
2. 检查SDKAppID是否正确（1600125415）
3. 检查密钥是否正确
4. 查看控制台错误信息

## 📋 下一步

安装完TIM SDK后，继续执行：
**Step 7：完善会话列表页面（1.5小时）**
