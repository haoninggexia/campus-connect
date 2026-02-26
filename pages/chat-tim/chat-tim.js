// pages/chat-tim/chat-tim.js

Page({
  data: {
    friendID: '',
    friendName: '',
    friendAvatar: '',
    myAvatar: '',
    messages: [],
    inputText: '',
    scrollIntoView: '',
    scrollTop: 0
  },

  onLoad(options) {
    try {
      // 解析好友信息
      const friend = options.friend ? JSON.parse(decodeURIComponent(options.friend)) : null;

      if (!friend || !friend.friendId) {
        wx.showToast({
          title: '参数错误',
          icon: 'none'
        });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
        return;
      }

      // 获取当前用户信息
      const userInfo = wx.getStorageSync('user_info') || {};

      this.setData({
        friendID: friend.friendId,
        friendName: friend.friendName,
        friendAvatar: friend.friendHeadUrl || '/image/other_head.jpg',
        myAvatar: userInfo.avatarUrl || '/image/other_head.jpg'
      });

      // 设置页面标题
      wx.setNavigationBarTitle({
        title: friend.friendName || '聊天'
      });

      // 监听消息接收
      this.setupMessageListener();

    } catch (e) {
      console.error('onLoad error:', e);
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  onShow() {
    // 滚动到底部
    this.scrollToBottom();
  },

  /**
   * 设置消息监听
   */
  setupMessageListener() {
    const app = getApp();

    // 监听IM消息
    if (app.appIMDelegate && app.appIMDelegate.imHandler) {
      app.appIMDelegate.imHandler.setOnReceiveMessageListener({
        listener: (msg) => {
          console.log('收到消息', msg);

          // 只处理当前聊天对象的消息
          if (msg.from === this.data.friendID) {
            this.addMessage({
              id: Date.now(),
              isSelf: false,
              type: msg.type || 'text',
              content: msg.content,
              from: msg.from,
              fromName: this.data.friendName,
              time: Date.now()
            });
          }
        }
      });
    }
  },

  /**
   * 添加消息到列表
   */
  addMessage(message) {
    // 格式化时间
    message.timeStr = this.formatTime(message.time);

    const messages = this.data.messages.concat(message);

    this.setData({
      messages: messages
    });

    // 滚动到底部
    this.scrollToBottom();
  },

  /**
   * 输入框变化
   */
  onInputChange(e) {
    this.setData({
      inputText: e.detail.value
    });
  },

  /**
   * 发送消息
   */
  async onSend() {
    const content = this.data.inputText.trim();

    if (!content) {
      return;
    }

    // 清空输入框
    this.setData({
      inputText: ''
    });

    // 添加到消息列表（显示为发送中）
    const tempId = Date.now();
    this.addMessage({
      id: tempId,
      isSelf: true,
      type: 'text',
      content: content,
      from: '',
      fromName: '',
      time: Date.now()
    });

    try {
      // 发送消息
      const app = getApp();
      if (app.appIMDelegate && app.appIMDelegate.imHandler) {
        await app.appIMDelegate.imHandler.sendMsg({
          content: {
            type: 'text',
            to: this.data.friendID,
            text: content
          }
        });

        console.log('消息发送成功');
      }
    } catch (e) {
      console.error('发送消息失败', e);
      wx.showToast({
        title: '发送失败',
        icon: 'none'
      });
    }
  },

  /**
   * 预览图片
   */
  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({
      urls: [url],
      current: url
    });
  },

  /**
   * 滚动到底部
   */
  scrollToBottom() {
    const messages = this.data.messages;
    if (messages.length > 0) {
      this.setData({
        scrollIntoView: 'msg-' + messages[messages.length - 1].id
      });
    }
  },

  /**
   * 返回
   */
  onBack() {
    wx.navigateBack();
  },

  /**
   * 查看好友信息
   */
  onViewFriendInfo() {
    wx.showModal({
      title: '好友信息',
      content: `昵称：${this.data.friendName}\nID：${this.data.friendID}`,
      showCancel: false
    });
  },

  /**
   * 格式化时间
   */
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }
});
