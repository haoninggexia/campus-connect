# 3天MVP实施方案 - 同校交友小程序

> **适用人群**：零基础个人开发者
> **开发目标**：3天内完成可上线审核的MVP版本
> **技术选型**：微信小程序 + 微信云开发 + 腾讯云IM

---

## 📋 方案概述

### 核心功能（MVP最小可行版本）
✅ 用户登录（微信授权）  
✅ 1对1聊天（文字+语音）  
✅ 按大学分类的群组聊天室  
✅ 添加好友功能  
✅ 离线消息支持  

### 技术栈简化
- ❌ 去除：Node.js自建服务器、MySQL数据库、Nginx部署
- ✅ 采用：微信云开发（免费额度充足）、腾讯云IM SDK（按量计费）

### 时间分配
- **第1天**：基础搭建 + 云开发配置（6小时）
- **第2天**：核心聊天功能（8小时）
- **第3天**：群组功能 + 测试优化（6小时）

---

## 🚀 第1天：基础搭建 + 云开发配置

### Step 1：开通微信云开发（1小时）

#### 1.1 在微信开发者工具中开通云开发
1. 打开微信开发者工具，进入你的项目
2. 点击顶部菜单「工具」→「构建云开发」
3. 点击「开通」按钮
4. 选择「基础版」（免费，足够MVP使用）
5. 创建环境，环境名称填写 `campus-chat`，自动生成环境ID

#### 1.2 安装云开发SDK
在项目根目录执行：
```bash
npm install --save wx-server-sdk
```

#### 1.3 配置云开发
修改 `app.js`：
```javascript
App({
    globalData: {
        userInfo: {},
        cloudEnv: 'campus-chat', // 替换为你的环境ID
        db: null
    },
    onLaunch(options) {
        // 初始化云开发
        if (!wx.cloud) {
            console.error('请使用 2.2.3 或以上的基础库以使用云能力')
        } else {
            wx.cloud.init({
                env: this.globalData.cloudEnv,
                traceUser: true,
            })
            this.globalData.db = wx.cloud.database()
        }
    }
})
```

---

### Step 2：开通腾讯云IM（30分钟）

#### 2.1 注册腾讯云IM
1. 访问：https://console.cloud.tencent.com/im
2. 登录腾讯云账号（如果没有，先注册）
3. 点击「创建新应用」
4. 应用名称填写「同校交友」
5. 创建成功后，记录 **SDKAppID**（后续配置需要）

#### 2.2 获取密钥（安全配置）
1. 在腾讯云IM控制台，找到你的应用
2. 点击「应用配置」→「基础信息」
3. 找到「密钥信息」，记录 **Key** 和 **Secret**（后续在云函数中使用）

#### 2.3 更新TIM配置
修改 `utils/tim-config.js`：
```javascript
export default {
    // 替换为你的实际SDKAppID
    SDKAppID: 你的SDKAppID数字,

    // 用户配置将在云函数中动态生成
    useTIM() {
        return this.SDKAppID !== 0;
    },

    // 获取当前用户ID（从缓存读取）
    getCurrentUser() {
        const user = wx.getStorageSync('user_info');
        return user || null;
    }
}
```

---

### Step 3：创建云数据库表结构（1.5小时）

#### 3.1 在云开发控制台创建集合
1. 打开微信开发者工具，点击「云开发」→「数据库」
2. 创建以下集合（集合即数据表）：

**表1：users（用户表）**
```javascript
{
  _id: "自动生成",
  _openid: "微信用户唯一标识",
  userID: "用户ID，如：wx_xxx",
  nickName: "昵称",
  avatarUrl: "头像URL",
  university: "所在大学",
  major: "专业",
  createTime: "创建时间"
}
```

**表2：friends（好友关系表）**
```javascript
{
  _id: "自动生成",
  userID: "发起方用户ID",
  friendID: "好友用户ID",
  status: 0, // 0:待确认, 1:已同意, 2:已拒绝
  createTime: "创建时间"
}
```

**表3：groups（群组表）**
```javascript
{
  _id: "自动生成",
  groupID: "群组ID，如：group_北京大学",
  groupName: "群组名称",
  university: "所属大学",
  memberCount: 0, // 成员数量
  createTime: "创建时间"
}
```

#### 3.2 设置数据库权限
1. 在云开发控制台，找到每个集合
2. 点击「权限设置」
3. 选择「自定义」：
```json
{
  "read": true,
  "write": "doc._openid == auth.openid"
}
```

---

### Step 4：创建云函数 - UserSig生成（2小时）

> **重要说明**：UserSig必须在服务端生成，不能在前端生成（安全原因）

#### 4.1 创建云函数目录
1. 在项目根目录创建 `cloudfunctions` 文件夹
2. 创建云函数 `getUserSig`：
   ```
   cloudfunctions/getUserSig/
   ├── index.js
   ├── package.json
   ```

#### 4.2 编写云函数代码
创建 `cloudfunctions/getUserSig/index.js`：
```javascript
const crypto = require('crypto')

exports.main = async (event, context) => {
  const { userID } = event

  // ⚠️ 替换为你在腾讯云IM控制台获取的密钥
  const SDKAppID = '你的SDKAppID'
  const key = '你的Key'
  const secret = '你的Secret'

  // UserSig过期时间（7天）
  const expire = 7 * 24 * 60 * 60

  // 生成UserSig（简化版，生产环境建议使用官方SDK）
  const currTime = Math.floor(Date.now() / 1000)
  const sigContent = `${userID}:${currTime}:${expire}:${key}`
  const userSig = crypto
    .createHmac('sha256', secret)
    .update(sigContent)
    .digest('base64')

  return {
    userID,
    userSig,
    SDKAppID
  }
}
```

创建 `cloudfunctions/getUserSig/package.json`：
```json
{
  "name": "getUserSig",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

#### 4.3 部署云函数
1. 右键 `cloudfunctions/getUserSig` 文件夹
2. 选择「上传并部署：云端安装依赖」
3. 等待部署完成（约1分钟）

---

### Step 5：创建登录页面（1.5小时）

#### 5.1 创建登录页面文件
创建 `pages/auth/auth.wxml`：
```xml
<view class="auth-container">
  <view class="header">
    <image src="/image/logo.png" class="logo"></image>
    <text class="title">同校交友</text>
    <text class="subtitle">找到你的同校同学</text>
  </view>

  <view class="form">
    <picker mode="selector" range="{{universities}}" bindchange="onUniversityChange">
      <view class="picker">
        {{university || '选择你的大学'}}
        <text class="arrow">></text>
      </view>
    </picker>

    <input
      class="input"
      placeholder="填写你的专业"
      value="{{major}}"
      bindinput="onMajorInput"
    />

    <button
      class="btn-login"
      open-type="getUserInfo"
      bindgetuserinfo="onLogin"
    >
      微信授权登录
    </button>
  </view>
</view>
```

创建 `pages/auth/auth.wxss`：
```css
.auth-container {
  padding: 60rpx 40rpx;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  text-align: center;
  margin-bottom: 100rpx;
}

.logo {
  width: 200rpx;
  height: 200rpx;
  border-radius: 40rpx;
}

.title {
  display: block;
  font-size: 48rpx;
  font-weight: bold;
  margin: 40rpx 0 20rpx;
}

.subtitle {
  font-size: 28rpx;
  color: #999;
}

.picker, .input {
  background: #f5f5f5;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 30rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.arrow {
  color: #999;
}

.btn-login {
  background: #35c8fb;
  color: white;
  border-radius: 12rpx;
  margin-top: 40rpx;
}
```

创建 `pages/auth/auth.js`：
```javascript
Page({
  data: {
    universities: [
      '北京大学', '清华大学', '复旦大学', '上海交通大学',
      '浙江大学', '南京大学', '武汉大学', '华中科技大学',
      '中山大学', '西安交通大学', '哈尔滨工业大学'
    ],
    university: '',
    major: ''
  },

  onUniversityChange(e) {
    this.setData({
      university: this.data.universities[e.detail.value]
    })
  },

  onMajorInput(e) {
    this.setData({
      major: e.detail.value
    })
  },

  async onLogin(e) {
    // 1. 表单验证
    if (!this.data.university) {
      wx.showToast({ title: '请选择大学', icon: 'none' })
      return
    }

    if (!this.data.major) {
      wx.showToast({ title: '请填写专业', icon: 'none' })
      return
    }

    // 2. 获取微信用户信息
    const { userInfo } = e.detail
    if (!userInfo) {
      wx.showToast({ title: '请授权', icon: 'none' })
      return
    }

    wx.showLoading({ title: '登录中...' })

    try {
      // 3. 获取微信登录凭证
      const loginRes = await wx.login()

      // 4. 存储用户信息到云数据库
      const db = wx.cloud.database()
      const { data: existingUsers } = await db.collection('users')
        .where({ _openid: '{openid}' })
        .get()

      let userID

      if (existingUsers.length > 0) {
        // 用户已存在
        userID = existingUsers[0].userID
      } else {
        // 新用户，创建记录
        userID = `wx_${loginRes.code}`
        await db.collection('users').add({
          data: {
            userID,
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl,
            university: this.data.university,
            major: this.data.major,
            createTime: new Date()
          }
        })
      }

      // 5. 缓存用户信息
      wx.setStorageSync('user_info', {
        userID,
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
        university: this.data.university,
        major: this.data.major
      })

      // 6. 调用云函数获取UserSig
      const { result } = await wx.cloud.callFunction({
        name: 'getUserSig',
        data: { userID }
      })

      wx.setStorageSync('user_sig', result)

      wx.hideLoading()
      wx.showToast({ title: '登录成功', icon: 'success' })

      // 7. 跳转到首页
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/chat-list/chat-list'
        })
      }, 1500)

    } catch (err) {
      wx.hideLoading()
      console.error('登录失败', err)
      wx.showToast({ title: '登录失败，请重试', icon: 'none' })
    }
  }
})
```

#### 5.2 更新路由配置
修改 `app.json`，添加登录页面：
```json
{
  "pages": [
    "pages/auth/auth",
    "pages/chat-list/chat-list",
    "pages/chat/chat",
    "pages/chat-input/chat-input",
    "pages/friends/friends"
  ]
}
```

---

## 💬 第2天：核心聊天功能

### Step 6：改造IM Handler对接腾讯云IM（2.5小时）

#### 6.1 安装TIM SDK
```bash
npm install --save tim-js-sdk
```

#### 6.2 修改IM Handler实现
修改 `libs/im-sdk/sdk/tim-handler-imp.js`：
```javascript
import TIM from 'tim-js-sdk'

export default class TIMHandlerImp {
  constructor() {
    this.tim = null
    this.loginPromise = null
    this.onReceiveMessageListener = null
  }

  createConnection({ options }) {
    // 读取TIM配置
    const timConfig = require('../../utils/tim-config.js').default

    // 初始化TIM实例
    this.tim = TIM.create({
      SDKAppID: timConfig.SDKAppID
    })

    // 设置日志级别
    this.tim.setLogLevel(4)

    // 监听事件
    this.tim.on(TIM.EVENT.MESSAGE_RECEIVED, this.handleMessageReceived.bind(this))

    // 登录TIM
    this.login()
  }

  async login() {
    if (this.loginPromise) return this.loginPromise

    const userInfo = wx.getStorageSync('user_info')
    const userSigData = wx.getStorageSync('user_sig')

    if (!userInfo || !userSigData) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/auth/auth' })
      }, 1500)
      return
    }

    this.loginPromise = this.tim.login({
      userID: userInfo.userID,
      userSig: userSigData.userSig
    })

    try {
      await this.loginPromise
      console.log('TIM登录成功', userInfo.userID)
    } catch (error) {
      console.error('TIM登录失败', error)
      wx.showToast({ title: '登录失败，请重试', icon: 'none' })
    }
  }

  handleMessageReceived(event) {
    const messages = event.data
    messages.forEach(message => {
      if (this.onReceiveMessageListener) {
        this.onReceiveMessageListener({
          type: 'receive-message',
          message: {
            from: message.from,
            content: message.payload.text,
            time: message.time,
            type: message.type
          }
        })
      }
    })
  }

  setOnReceiveMessageListener({ listener }) {
    this.onReceiveMessageListener = listener
  }

  async sendMsg({ content }) {
    const message = this.tim.createTextMessage({
      to: content.to,
      payload: { text: content.text }
    })

    try {
      await this.tim.sendMessage(message)
      return { message }
    } catch (error) {
      console.error('发送消息失败', error)
      throw error
    }
  }

  async getConversationList() {
    try {
      const list = await this.tim.getConversationList()
      return list.data
    } catch (error) {
      console.error('获取会话列表失败', error)
      return []
    }
  }

  async createGroup({ name, university }) {
    try {
      const groupID = `group_${university}`
      const res = await this.tim.createGroup({
        type: TIM.TYPES.GRP_PUBLIC,
        name: name,
        groupID: groupID
      })
      return res.data.group
    } catch (error) {
      console.error('创建群组失败', error)
      throw error
    }
  }

  async joinGroup({ groupID }) {
    try {
      await this.tim.joinGroup({ groupID })
    } catch (error) {
      console.error('加入群组失败', error)
      throw error
    }
  }
}
```

---

### Step 7：完善会话列表页面（1.5小时）

#### 7.1 修改会话列表页面
修改 `pages/chat-list/chat-list.js`：
```javascript
Page({
  data: {
    conversations: [],
    userInfo: null
  },

  onLoad(options) {
    this.setData({
      userInfo: wx.getStorageSync('user_info')
    })

    // 如果未登录，跳转到登录页
    if (!this.data.userInfo) {
      wx.redirectTo({ url: '/pages/auth/auth' })
    }
  },

  onShow() {
    this.loadConversations()
  },

  async loadConversations() {
    try {
      const handler = getApp().getIMHandler()
      const list = await handler.getConversationList()

      const conversations = list.map(item => {
        const lastMsg = item.lastMessage
        return {
          friendName: item.userProfile.nickName || item.toAccount,
          friendId: item.toAccount,
          avatar: item.userProfile.avatar || '/image/default-avatar.png',
          content: lastMsg ? lastMsg.payload.text : '',
          time: lastMsg ? this.formatTime(lastMsg.time) : ''
        }
      })

      this.setData({ conversations })
    } catch (err) {
      console.error('加载会话列表失败', err)
    }
  },

  toChat(e) {
    const item = e.currentTarget.dataset.item
    wx.navigateTo({
      url: `../chat/chat?friend=${JSON.stringify(item)}`
    })
  },

  toGroups() {
    wx.navigateTo({ url: '/pages/groups/groups' })
  },

  formatTime(timestamp) {
    const date = new Date(timestamp * 1000)
    const hour = date.getHours().toString().padStart(2, '0')
    const minute = date.getMinutes().toString().padStart(2, '0')
    return `${hour}:${minute}`
  }
})
```

修改 `pages/chat-list/chat-list.wxml`：
```xml
<view class="container">
  <!-- 搜索框 -->
  <view class="search-bar">
    <input
      class="search-input"
      placeholder="搜索好友"
      bindconfirm="onSearch"
    />
  </view>

  <!-- 大学群组入口 -->
  <view class="group-entry" bindtap="toGroups">
    <text class="group-icon">🎓</text>
    <view class="group-info">
      <text class="group-name">大学群组</text>
      <text class="group-desc">加入你的大学群组</text>
    </view>
    <text class="arrow">></text>
  </view>

  <!-- 会话列表 -->
  <view class="conversation-list">
    <view
      class="conversation-item"
      wx:for="{{conversations}}"
      wx:key="friendId"
      bindtap="toChat"
      data-item="{{item}}"
    >
      <image class="avatar" src="{{item.avatar}}"></image>
      <view class="content">
        <view class="header">
          <text class="name">{{item.friendName}}</text>
          <text class="time">{{item.time}}</text>
        </view>
        <text class="last-msg">{{item.content}}</text>
      </view>
    </view>
  </view>
</view>
```

---

### Step 8：完善聊天页面（2小时）

#### 8.1 修改聊天页面发送逻辑
修改 `pages/chat/im-operator.js`：
```javascript
export default class IMOperator {
  constructor(page, friend) {
    this.page = page
    this.friend = friend
    this.handler = getApp().getIMHandler()
    this.onReceiveMessageListeners = []
  }

  async onSimulateSendMsg({ content }) {
    try {
      const res = await this.handler.sendMsg({
        content: {
          to: this.friend.friendId,
          text: content.text
        }
      })

      return {
        msg: {
          id: Date.now(),
          content: content.text,
          isSelf: true,
          createTime: Date.now(),
          type: 'text'
        }
      }
    } catch (error) {
      console.error('发送失败', error)
      throw error
    }
  }

  onSimulateReceiveMsg(callback) {
    this.handler.setOnReceiveMessageListener({
      listener: (msg) => {
        callback(msg)
      }
    })
  }
}
```

---

### Step 9：实现好友添加功能（2.5小时）

#### 9.1 创建添加好友页面
创建 `pages/add-friend/add-friend.wxml`：
```xml
<view class="container">
  <!-- 搜索框 -->
  <view class="search-bar">
    <input
      class="search-input"
      placeholder="输入用户ID或昵称"
      value="{{keyword}}"
      bindinput="onInput"
    />
    <button class="search-btn" bindtap="onSearch">搜索</button>
  </view>

  <!-- 搜索结果 -->
  <view class="result-list" wx:if="{{searchResults.length > 0}}">
    <view
      class="user-item"
      wx:for="{{searchResults}}"
      wx:key="userID"
    >
      <image class="avatar" src="{{item.avatarUrl}}"></image>
      <view class="info">
        <text class="name">{{item.nickName}}</text>
        <text class="university">{{item.university}} - {{item.major}}</text>
      </view>
      <button
        class="btn-add"
        bindtap="onAddFriend"
        data-userid="{{item.userID}}"
        wx:if="{{item.isFriend === false}}"
      >
        添加
      </button>
      <text class="added" wx:else>已添加</text>
    </view>
  </view>
</view>
```

创建 `pages/add-friend/add-friend.js`：
```javascript
Page({
  data: {
    keyword: '',
    searchResults: []
  },

  onInput(e) {
    this.setData({
      keyword: e.detail.value
    })
  },

  async onSearch() {
    if (!this.data.keyword.trim()) {
      wx.showToast({ title: '请输入关键词', icon: 'none' })
      return
    }

    wx.showLoading({ title: '搜索中...' })

    try {
      const db = wx.cloud.database()
      const _ = db.command

      // 模糊搜索用户ID或昵称
      const { data } = await db.collection('users')
        .where(_.or([
          { userID: this.data.keyword },
          { nickName: db.RegExp({
              regexp: this.data.keyword,
              options: 'i'
            })
          }
        ]))
        .get()

      // 过滤掉自己
      const myID = wx.getStorageSync('user_info').userID
      const results = data.filter(user => user.userID !== myID)

      // 检查是否已经是好友
      for (const user of results) {
        const { data: friends } = await db.collection('friends')
          .where({
            userID: myID,
            friendID: user.userID,
            status: 1
          })
          .get()

        user.isFriend = friends.length > 0
      }

      this.setData({ searchResults: results })

      if (results.length === 0) {
        wx.showToast({ title: '未找到用户', icon: 'none' })
      }
    } catch (err) {
      console.error('搜索失败', err)
      wx.showToast({ title: '搜索失败', icon: 'none' })
    }

    wx.hideLoading()
  },

  async onAddFriend(e) {
    const friendID = e.currentTarget.dataset.userid
    const myID = wx.getStorageSync('user_info').userID

    wx.showLoading({ title: '添加中...' })

    try {
      const db = wx.cloud.database()

      // 发送好友请求
      await db.collection('friends').add({
        data: {
          userID: myID,
          friendID: friendID,
          status: 0, // 待确认
          createTime: new Date()
        }
      })

      wx.hideLoading()
      wx.showToast({ title: '好友请求已发送', icon: 'success' })

      // 刷新列表
      this.onSearch()
    } catch (err) {
      wx.hideLoading()
      console.error('添加失败', err)
      wx.showToast({ title: '添加失败', icon: 'none' })
    }
  }
})
```

#### 9.2 在好友列表添加"添加好友"入口
修改 `pages/friends/friends.wxml`，添加按钮：
```xml
<view class="header">
  <text class="title">好友列表</text>
  <button class="btn-add" bindtap="onAddFriend">+ 添加好友</button>
</view>
```

修改 `pages/friends/friends.js`：
```javascript
Page({
  // ... 原有代码

  onAddFriend() {
    wx.navigateTo({ url: '/pages/add-friend/add-friend' })
  }
})
```

---

## 🎓 第3天：群组功能 + 测试优化

### Step 10：创建大学群组页面（2小时）

#### 10.1 创建群组页面
创建 `pages/groups/groups.wxml`：
```xml
<view class="container">
  <view class="my-group" wx:if="{{myGroup}}">
    <text class="section-title">我的大学群组</text>
    <view class="group-item" bindtap="onEnterGroup" data-groupid="{{myGroup.groupID}}">
      <text class="group-icon">🎓</text>
      <view class="info">
        <text class="group-name">{{myGroup.groupName}}</text>
        <text class="group-desc">{{myGroup.memberCount}}人在线</text>
      </view>
      <text class="arrow">></text>
    </view>
  </view>

  <view class="other-groups">
    <text class="section-title">其他大学群组</text>
    <view
      class="group-item"
      wx:for="{{otherGroups}}"
      wx:key="groupID"
      bindtap="onJoinGroup"
      data-group="{{item}}"
    >
      <text class="group-icon">🎓</text>
      <view class="info">
        <text class="group-name">{{item.groupName}}</text>
        <text class="group-desc">{{item.memberCount}}人在线</text>
      </view>
      <button class="btn-join">加入</button>
    </view>
  </view>
</view>
```

创建 `pages/groups/groups.js`：
```javascript
Page({
  data: {
    myGroup: null,
    otherGroups: [
      { groupID: 'group_北京大学', groupName: '北京大学', memberCount: 128 },
      { groupID: 'group_清华大学', groupName: '清华大学', memberCount: 156 },
      { groupID: 'group_复旦大学', groupName: '复旦大学', memberCount: 89 },
      { groupID: 'group_上海交通大学', groupName: '上海交通大学', memberCount: 112 },
      { groupID: 'group_浙江大学', groupName: '浙江大学', memberCount: 145 }
    ]
  },

  onLoad() {
    this.loadMyGroup()
  },

  async loadMyGroup() {
    const userInfo = wx.getStorageSync('user_info')
    if (!userInfo.university) return

    const groupID = `group_${userInfo.university}`

    this.setData({
      myGroup: {
        groupID: groupID,
        groupName: userInfo.university,
        memberCount: Math.floor(Math.random() * 200) + 50
      }
    })
  },

  onEnterGroup(e) {
    const groupID = e.currentTarget.dataset.groupid
    const groupName = this.data.myGroup.groupName

    wx.navigateTo({
      url: `/pages/chat/chat?friend=${JSON.stringify({
        friendId: groupID,
        friendName: groupName,
        isGroup: true
      })}`
    })
  },

  async onJoinGroup(e) {
    const group = e.currentTarget.dataset.group

    wx.showModal({
      title: '提示',
      content: `确定要加入${group.groupName}群组吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '加入中...' })

          try {
            const handler = getApp().getIMHandler()
            await handler.joinGroup({ groupID: group.groupID })

            wx.hideLoading()
            wx.showToast({ title: '加入成功', icon: 'success' })

            setTimeout(() => {
              this.onEnterGroup({ currentTarget: { dataset: { groupid: group.groupID }}})
            }, 1500)
          } catch (err) {
            wx.hideLoading()
            console.error('加入群组失败', err)
            wx.showToast({ title: '加入失败', icon: 'none' })
          }
        }
      }
    })
  }
})
```

---

### Step 11：完善离线消息支持（1.5小时）

#### 11.1 修改聊天页面，加载历史消息
修改 `pages/chat/chat.js`，在 `onLoad` 中添加：
```javascript
onLoad(options) {
  // ... 原有代码

  this.loadHistoryMessages()
}

async loadHistoryMessages() {
  try {
    const handler = getApp().getIMHandler()

    // 如果是群组
    if (this.friend.isGroup) {
      const messages = await handler.getGroupHistoryMessage({
        groupID: this.friend.friendId,
        count: 20
      })

      this.displayMessages(messages)
    } else {
      // 单聊历史消息
      const messages = await handler.getC2CHistoryMessage({
        userID: this.friend.friendId,
        count: 20
      })

      this.displayMessages(messages)
    }
  } catch (err) {
    console.error('加载历史消息失败', err)
  }
}

displayMessages(messages) {
  const chatItems = messages.map(msg => ({
    id: msg.ID,
    content: msg.payload.text,
    isSelf: msg.from === wx.getStorageSync('user_info').userID,
    createTime: msg.time,
    type: msg.type
  }))

  this.setData({ chatItems })
}
```

---

### Step 12：测试与上线准备（2.5小时）

#### 12.1 功能测试清单
- [ ] 用户登录流程（选择大学、填写专业、微信授权）
- [ ] 1对1聊天（发送文字消息）
- [ ] 语音消息录制与发送
- [ ] 搜索并添加好友
- [ ] 加入大学群组
- [ ] 群组聊天
- [ ] 离线消息接收
- [ ] 页面跳转流畅性

#### 12.2 性能优化
修改 `app.json`，添加性能配置：
```json
{
  "lazyCodeLoading": "requiredComponents",
  "rendererOptions": {
    "skyline": {
      "defaultDisplayBlock": true,
      "disableABTest": true
    }
  }
}
```

#### 12.3 准备审核材料
在微信开发者工具中：
1. 点击「上传」按钮
2. 填写版本号和备注
3. 登录微信小程序后台：https://mp.weixin.qq.com
4. 进入「版本管理」→「开发版本」
5. 提交审核，填写以下信息：

**小程序名称**：同校交友  
**小程序简介**：找到你的同校同学，在线交流  
**服务类目**：社交 - 社区/论坛  
**小程序截图**：使用模拟器截图（会话列表、聊天页面、群组列表）

**审核说明**：
```
本小程序为同校学生交流平台，主要功能：
1. 用户通过微信授权登录，选择所在大学和专业
2. 提供1对1私聊功能，支持文字和语音消息
3. 按大学分类创建群组聊天室，方便同校学生交流
4. 支持搜索并添加好友功能
5. 使用腾讯云IM服务实现实时通讯
6. 使用微信云开发存储用户数据和关系数据

所有用户均可免费使用，不涉及任何付费功能。
```

#### 12.4 注意事项
1. **用户隐私**：确保在小程序后台填写「用户隐私保护指引」
2. **内容安全**：集成微信内容安全API，过滤敏感词（可选，MVP可跳过）
3. **测试账号**：准备2-3个测试账号，验证多用户场景
4. **云开发配额**：基础版免费额度：
   - 数据库：每天读取5万次，写入3万次
   - 云函数：每天调用2万次，400GBs运行时间
   - 存储：5GB
   - CDN：5GB/月

---

## 📊 成本预估

### 开发成本
- **腾讯云IM**：按量计费，MVP阶段预计 < 10元/月
  - 注册用户：免费
  - 消息存储：约0.1元/GB/月
  - 消息分发：约1元/百万条

- **微信云开发**：基础版免费
  - 免费额度足够支撑1000活跃用户

### 总成本
**< 15元/月**（仅腾讯云IM费用）

---

## 🎯 验收标准

### MVP可上线标准
✅ 用户可正常登录并选择大学  
✅ 可搜索并添加好友  
✅ 可与好友进行1对1文字聊天  
✅ 可加入并参与大学群组聊天  
✅ 支持语音消息发送  
✅ 离线消息可正常接收  
✅ 通过微信小程序审核  

---

## 📝 后续优化方向（上线后）

1. **增加功能**：
   - 图片消息
   - 表情包
   - 消息撤回
   - 消息已读状态
   - 在线状态显示

2. **优化体验**：
   - 消息搜索
   - 聊天背景
   - 语音自动播放
   - 消息通知

3. **数据分析**：
   - 用户增长统计
   - 聊天活跃度
   - 留存率分析

---

## 🆘 常见问题

### Q1: 云函数部署失败？
**A**: 检查以下几点：
1. 确保云开发已开通
2. 检查云函数中的密钥是否正确替换
3. 右键云函数文件夹选择「上传并部署」

### Q2: TIM登录失败？
**A**: 
1. 确认SDKAppID是否正确
2. 确认云函数返回的UserSig是否有效
3. 查看控制台错误日志

### Q3: 聊天消息收不到？
**A**:
1. 确认双方都已成功登录TIM
2. 检查网络连接
3. 确认消息监听器是否正确设置

### Q4: 审核被拒？
**A**:
常见被拒原因：
- 未填写「用户隐私保护指引」
- 小程序名称与其他应用重复
- 功能描述与实际不符
- 涉及敏感内容

---

## 📞 技术支持

遇到问题可查阅：
- 微信云开发文档：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html
- 腾讯云IM文档：https://cloud.tencent.com/document/product/269
- TIM SDK GitHub：https://github.com/tencentyun/TIMSDK

---

## ✅ 总结

本方案针对零基础个人开发者，通过以下策略实现3天MVP：
1. 使用微信云开发替代自建服务器（节省90%开发时间）
2. 复用现有UI组件和页面结构
3. 最小化功能集，确保核心可用
4. 提供详细代码示例和操作步骤

祝开发顺利！🎉
