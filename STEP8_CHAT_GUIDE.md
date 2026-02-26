# Step 8: 聊天功能测试指南

## 功能说明

已完成基于腾讯云IM SDK的聊天页面开发，支持：
- ✅ 发送文本消息
- ✅ 接收文本消息
- ✅ 查看聊天记录
- ✅ 实时消息推送

## 页面结构

### 新增页面
- `pages/chat-tim/chat-tim.wxml` - 聊天页面模板
- `pages/chat-tim/chat-tim.wxss` - 聊天页面样式
- `pages/chat-tim/chat-tim.js` - 聊天页面逻辑
- `pages/chat-tim/chat-tim.json` - 页面配置

### 修改页面
- `pages/chat-list/chat-list.js` - 修改跳转逻辑，跳转到新聊天页面
- `app.json` - 注册新聊天页面

## 如何测试聊天功能

### 方法1：使用两台设备（推荐）

这是测试真实跨设备聊天的最好方法：

#### 设备A
1. 打开微信开发者工具
2. 登录用户A（例如：选择"北京大学" + "计算机"）
3. 进入会话列表

#### 设备B
1. 使用真机或模拟器
2. 登录用户B（例如：选择"清华大学" + "电子工程"）
3. 进入会话列表

#### 开始聊天
1. **设备A给设备B发送消息**：
   - 在会话列表中暂时看不到对方（因为没有聊天记录）
   - **需要先添加好友功能**（后续实现）

#### 临时测试方案：
由于会话列表是空的，我们需要手动创建一个测试入口。

### 方法2：修改代码手动创建会话（临时测试）

#### 步骤1：修改chat-list.js，添加测试按钮

在 `pages/chat-list/chat-list.js` 的 `data` 中添加测试数据：

```javascript
data: {
    conversations: [],
    // 临时添加测试会话
    testConversations: [
        {
            conversationId: 'test_conv_001',
            friendId: 'test_user_002',
            friendName: '测试用户2',
            friendHeadUrl: '/image/other_head.jpg',
            content: '这是一条测试消息',
            timeStr: '14:30'
        }
    ]
},
```

#### 步骤2：修改chat-list.wxml，显示测试会话

在 `pages/chat-list/chat-list.wxml` 中添加：

```xml
<import src="view/chat-item.wxml"/>

<!-- 临时测试按钮 -->
<view style="padding: 20rpx;">
    <button type="primary" bindtap="onTestChat">测试聊天功能</button>
</view>

<!-- 会话列表 -->
<block wx:for="{{conversations}}" wx:key="conversationId">
    <template is="chat-item" data="{{item:item}}"/>
</block>
```

#### 步骤3：添加测试方法

在 `pages/chat-list/chat-list.js` 中添加：

```javascript
// 测试聊天
onTestChat() {
    const friend = {
        friendId: 'test_user_002',
        friendName: '测试用户2',
        friendHeadUrl: '/image/other_head.jpg'
    };

    wx.navigateTo({
        url: `../chat-tim/chat-tim?friend=${encodeURIComponent(JSON.stringify(friend))}`
    });
},
```

#### 步骤4：测试发送消息
1. 点击"测试聊天功能"按钮
2. 进入聊天页面
3. 输入消息，点击"发送"
4. 查看消息是否显示在页面上

### 方法3：使用控制台模拟接收消息

#### 步骤1：进入聊天页面
使用方法2进入聊天页面

#### 步骤2：打开微信开发者工具控制台
输入以下代码模拟接收消息：

```javascript
const app = getApp();
const friendID = 'test_user_002';

// 模拟接收消息
const msg = {
    from: friendID,
    type: 'text',
    content: '这是模拟接收的消息',
    time: Date.now()
};

// 触发消息监听
app.appIMDelegate.imHandler._receiveListener(msg);
```

#### 步骤3：查看聊天页面
应该能看到模拟接收的消息显示在页面上。

## 当前已知问题

### 1. 会话列表为空
**原因**：没有聊天记录，也没有好友列表
**解决方案**：
- 需要实现好友添加功能（Step 9）
- 或者使用方法2手动测试

### 2. 无法看到对方在线状态
**原因**：当前实现中没有显示在线状态
**解决方案**：可以添加在线状态显示功能

### 3. 消息只能发送给自己
**原因**：没有好友列表，无法选择其他用户
**解决方案**：实现好友列表功能

## 功能特性

### 已实现
- ✅ 发送文本消息
- ✅ 显示聊天记录
- ✅ 时间格式化
- ✅ 自动滚动到底部
- ✅ 消息接收监听
- ✅ 消息气泡样式（自己/对方）

### 待实现
- ⏳ 发送图片消息
- ⏳ 发送语音消息
- ⏳ 消息重发功能
- ⏳ 消息撤回功能
- ⏳ 在线状态显示
- ⏳ 输入状态显示

## 调试技巧

### 查看消息发送日志
在控制台搜索：
- `发送消息` - 发送消息的日志
- `收到消息` - 接收消息的日志
- `消息发送成功` - 发送成功的日志
- `发送消息失败` - 发送失败的日志

### 检查TIM连接状态
在控制台搜索：
- `TIM登录成功` - TIM登录成功
- `TIM SDK准备就绪` - SDK准备就绪

### 查看聊天页面数据
在聊天页面的 `onLoad` 中添加：
```javascript
console.log('好友信息:', this.data.friendID, this.data.friendName);
```

## 下一步

### Step 9：好友列表功能
1. 获取用户列表
2. 添加好友功能
3. 显示好友在线状态

### Step 10：群组功能
1. 创建群组
2. 加入群组
3. 群组聊天

### Step 11：多人联机测试
1. 在两台设备上登录
2. 互相添加好友
3. 测试实时聊天

## 常见问题

### Q1: 发送消息后没显示？
A: 检查：
1. 控制台是否有错误
2. TIM是否已登录
3. 消息是否添加到列表中

### Q2: 接收不到消息？
A: 检查：
1. 消息监听器是否设置
2. from字段是否匹配
3. 是否在正确的聊天页面

### Q3: 消息时间格式不对？
A: 检查formatTime方法是否正确实现

### Q4: 页面无法滚动到底部？
A: 检查：
1. scroll-into-view设置是否正确
2. 消息ID是否匹配

---

**生成时间**: 2026-02-23 15:00
**状态**: ✅ 基础聊天功能已完成
**建议**: 先使用方法2手动测试，再实现好友功能
