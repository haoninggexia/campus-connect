# 项目升级日志

## [阶段1-步骤1] 启用腾讯云IM并配置多用户支持

### 📅 更新时间
2026-02-17

### 🎯 目标
从单机WebSocket模式升级到支持多用户、跨设备的腾讯云IM模式

### ✨ 新增功能

1. **动态IM模式切换**
   - 支持`SDKAppID`配置自动切换TIM/WebSocket模式
   - 提供工厂类 `IMFactory` 动态创建IM处理器实例

2. **多用户支持**
   - 支持配置多个用户（user_001, user_002, user_003）
   - 每个用户独立的UserSig配置
   - 通过`currentUserIndex`切换不同用户

3. **UserSig生成工具升级**
   - 支持批量生成多个用户的UserSig
   - 自动生成配置代码，方便复制
   - 提供详细的错误提示和使用说明

### 📝 修改文件

#### 1. `utils/tim-config.js`
- 添加 `useTIM()` 方法检测当前模式
- 扩展用户配置，支持更多用户
- 添加 `getAllUsers()` 方法获取所有用户
- 优化配置说明和注释

#### 2. `libs/im-sdk/im-factory.js`
- 重构为真正的工厂模式
- 添加 `getIMHandler()` 方法动态返回处理器
- 自动根据`SDKAppID`选择TIM或WebSocket实现
- 保持向后兼容的导出方式

#### 3. `delegate/app-im-delegate.js`
- 改为使用工厂获取IM处理器
- 根据`tim-config.js`自动初始化TIM或WebSocket
- 使用当前用户配置登录TIM
- 添加`onUnload`生命周期处理

#### 4. `generate-usersig.js`
- 支持批量生成多个用户的UserSig
- 自动输出配置代码，方便复制到`tim-config.js`
- 改进错误提示和使用说明
- 添加详细的配置步骤说明

#### 5. `package.json`
- 添加 `crypto-js` 依赖（用于UserSig生成）
- 添加 `npm run gen-usersig` 脚本快捷命令

### 📚 新增文档

#### 1. `TIM_SETUP.md`
- 腾讯云IM完整配置指南
- UserSig生成详细步骤
- 模式切换说明
- 多用户测试指南
- 常见问题解答

### 🔧 配置说明

#### 如何启用腾讯云IM

1. **获取SDKAppID和密钥**
   - 访问 [腾讯云IM控制台](https://console.cloud.tencent.com/im)
   - 创建应用并记录SDKAppID和密钥

2. **配置生成工具**
   ```javascript
   // generate-usersig.js
   const SDKAPPID = 1600125415;  // 你的SDKAppID
   const KEY = 'your-secret-key';  // 你的密钥
   ```

3. **生成UserSig**
   ```bash
   npm install
   npm run gen-usersig
   ```

4. **应用配置**
   - 将生成的配置复制到 `utils/tim-config.js`
   - 设置 `SDKAppID` 为实际值

#### 如何切换模式

**切换到腾讯云IM：**
```javascript
// utils/tim-config.js
SDKAppID: 1600125415,  // 实际的SDKAppID
```

**切换到WebSocket本地模式：**
```javascript
// utils/tim-config.js
SDKAppID: 0,  // 本地模式
websocketUrl: 'ws://localhost:8001'
```

### 🧪 测试方法

#### 单用户测试
- 在微信开发者工具中运行小程序
- 确认能正常登录和收发消息

#### 多用户测试
- 使用多台设备或多个模拟器实例
- 每个设备设置不同的 `currentUserIndex`
- 测试跨设备消息互通

### 📊 技术架构变化

#### 修改前
```
app-im-delegate.js
    ↓
WebSocketHandlerImp (固定)
    ↓
本地WebSocket服务器
```

#### 修改后
```
app-im-delegate.js
    ↓
IMFactory (工厂)
    ↓
[根据SDKAppID自动选择]
    ├─→ TIMHandlerImp (腾讯云IM)
    │        ↓
    │   腾讯云IM服务器
    │
    └─→ WebSocketHandlerImp (本地)
             ↓
        本地WebSocket服务器
```

### ⚠️ 注意事项

1. **安全警告**
   - `generate-usersig.js` 仅用于开发测试
   - 正式环境必须在服务端生成UserSig
   - 不要在前端暴露密钥

2. **UserSig有效期**
   - 默认有效期为7天
   - 过期后需重新生成
   - 建议定时更新

3. **域名配置**
   - 真机测试需要配置域名白名单
   - 或使用开发工具的"不校验合法域名"选项
   - 正式上线必须在微信公众平台配置

### 🎯 下一步计划

- [ ] 步骤2：搭建后端服务器
- [ ] 步骤3：设计并实现数据库
- [ ] 步骤4：实现用户注册登录
- [ ] 步骤5：添加大学信息管理
- [ ] 步骤6：实现用户学校关联

### 📖 参考文档

- [腾讯云IM官方文档](https://cloud.tencent.com/document/product/269)
- [TIM SDK小程序集成指南](https://cloud.tencent.com/document/product/269/68438)
- [UserSig生成原理](https://cloud.tencent.com/document/product/269/32688)
