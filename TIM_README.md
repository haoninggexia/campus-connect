# 腾讯云IM集成说明

## 功能升级
本项目已升级支持**腾讯云即时通信IM**，可实现两台手机之间的实时消息收发。

## 使用方式

### 方式一：使用腾讯云IM（推荐，支持跨设备通信）

#### 1. 创建腾讯云IM应用
1. 访问腾讯云IM控制台：https://console.cloud.tencent.com/im
2. 点击"创建新应用"
3. 创建后获取 **SDKAppID**

#### 2. 配置小程序
1. 打开 `utils/tim-config.js` 文件
2. 将 `SDKAppID: 0` 替换为你的实际SDKAppID
3. 示例：
   ```javascript
   export default {
     SDKAppID: 1400123456, // 替换为你的SDKAppID
     generateUserID: () => {
       return 'user_' + Date.now();
     }
   };
   ```

#### 3. 安装TIM SDK依赖
在项目根目录执行：
```bash
npm install tim-wx-sdk --save
```

#### 4. 在微信开发者工具中构建NPM
1. 点击菜单栏：工具 -> 构建npm
2. 等待构建完成

#### 5. 编译运行
1. 点击"编译"按钮
2. 在两台手机上分别扫码预览
3. 两人使用不同的用户ID登录，即可互相收发消息

### 方式二：使用WebSocket本地服务器（仅用于本地测试）

保持 `utils/tim-config.js` 中的 `SDKAppID: 0` 不变，项目将自动使用WebSocket本地服务器模式。

**注意：** 此模式只能在同一台电脑上的两个模拟器中使用，无法实现跨设备通信。

## 腾讯云IM优势

✅ **跨设备通信**：支持任意两台手机实时通信
✅ **消息可靠性**：专业的消息推送服务，稳定可靠
✅ **离线消息**：支持离线消息存储和推送
✅ **多媒体消息**：支持文字、图片、语音、文件等多种消息类型
✅ **历史消息**：支持查询历史聊天记录
✅ **会话管理**：自动管理会话列表和未读消息

## 开发注意事项

### 正式环境使用
当前开发环境使用 `userSig: '*'` 进行测试，正式环境需要：

1. 在服务端实现UserSig生成逻辑（参考：https://cloud.tencent.com/document/product/269/32688）
2. 修改 `app-im-delegate.js` 中的 `userSig` 获取方式
3. 为每个用户生成唯一的userID

### 域名配置
在小程序管理后台配置以下服务器域名：

- request合法域名：`console.tim.qq.com`
- uploadFile合法域名：`cos.ap-shanghai.myqcloud.com`（根据实际区域调整）
- downloadFile合法域名：`cos.ap-shanghai.myqcloud.com`（根据实际区域调整）

## 功能对比

| 功能 | WebSocket本地 | 腾讯云IM |
|------|-------------|----------|
| 跨设备通信 | ❌ 不支持 | ✅ 支持 |
| 消息可靠性 | ⚠️ 低 | ✅ 高 |
| 离线消息 | ❌ 不支持 | ✅ 支持 |
| 会话管理 | ⚠️ 简单 | ✅ 完善 |
| 多媒体消息 | ⚠️ 需自行实现 | ✅ 原生支持 |
| 部署难度 | ✅ 简单 | ⚠️ 需配置 |

## 技术支持

- 腾讯云IM文档：https://cloud.tencent.com/document/product/269
- GitHub Demo：https://github.com/TencentCloud/TIMSDK/tree/master/WXMini
- 技术交流群：点击文档中的"加入技术交流群"

## 卸载腾讯云IM

如需回退到WebSocket本地模式：

1. 将 `utils/tim-config.js` 中的 `SDKAppID` 改为 `0`
2. 编译项目
3. 启动本地WebSocket服务器：`node server.js`

---

**提示：** 建议优先使用腾讯云IM，可以获得更完善的即时通信体验！
