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
    scrollTop: 0,
    showExtra: false  // 是否显示扩展面板（+号点击后展开）
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

    // 开放时间兜底：1v1 聊天走 TIM 直连，服务端无法拦截，这里做客户端拦截
    this.getClosedStatus().then((closed) => {
      if (closed) {
        this.handleClosed(closed.message);
      }
    });
  },

  /**
   * 获取“未开放”状态（15 秒缓存，避免频繁调用云函数）
   * 返回 status 对象表示当前已关闭，返回 null 表示可正常使用
   */
  getClosedStatus() {
    const now = Date.now();
    if (this._statusCache && now - this._statusCache.at < 15000) {
      return Promise.resolve(this._statusCache.status);
    }

    return wx.cloud.callFunction({
      name: 'getAppStatus',
      data: {}
    }).then((res) => {
      const status = (res && res.result) || null;
      const closed = (status && status.code === 0 && status.enabled && !status.isOpen) ? status : null;
      this._statusCache = { at: now, status: closed };
      return closed;
    }).catch((e) => {
      console.warn('获取开放状态失败，默认放行:', e);
      return null;
    });
  },

  /**
   * 已过开放时间：提示并返回状态页
   */
  handleClosed(message) {
    if (this._gateClosed) return;
    this._gateClosed = true;

    wx.showModal({
      title: '休息时间',
      content: message || '当前不在开放时间',
      showCancel: false,
      confirmText: '知道了',
      success: () => {
        wx.reLaunch({ url: '/pages/closed/closed' });
      },
      fail: () => {
        wx.reLaunch({ url: '/pages/closed/closed' });
      }
    });
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

    // 开放时间兜底：未开放时不允许发送（走 TIM 直连，需前端拦截）
    const closed = await this.getClosedStatus();
    if (closed) {
      this.handleClosed(closed.message);
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
   * 切换扩展面板（+号按钮）
   */
  onToggleExtra() {
    this.setData({
      showExtra: !this.data.showExtra
    });
  },

  /**
   * 选择图片（相册 / 拍摄）
   */
  async onChooseImage(e) {
    const source = e.currentTarget.dataset.source; // 'album' 或 'camera'
    const sourceType = source === 'camera' ? ['camera'] : ['album'];

    // 先收起面板，避免遮挡
    this.setData({ showExtra: false });

    // 开放时间兜底（与文字消息保持一致的拦截策略）
    try {
      const closed = await this.getClosedStatus();
      if (closed) {
        this.handleClosed(closed.message);
        return;
      }
    } catch (err) {
      // 状态查询失败不影响发送，避免误拦截
      console.warn('获取开放状态失败，继续尝试发送图片:', err);
    }

    // 调用微信原生选图
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'], // 压缩图，减小体积避免超时
      sourceType: sourceType,
      success: (res) => {
        const tempFilePath = res.tempFilePaths && res.tempFilePaths[0];
        if (!tempFilePath) {
          wx.showToast({ title: '未选择图片', icon: 'none' });
          return;
        }
        this.sendImageMessage(tempFilePath);
      },
      fail: (err) => {
        console.error('选择图片失败:', err);
        wx.showToast({
          title: '打开' + (source === 'camera' ? '相机' : '相册') + '失败',
          icon: 'none',
          duration: 2000
        });
      }
    });
  },

  /**
   * 发送图片消息
   * @param {string} tempFilePath - 微信临时文件路径
   */
  async sendImageMessage(tempFilePath) {
    // 1. 先做大小检查（微信限制单文件 10MB）
    try {
      const info = await this.getFileInfoSafe(tempFilePath);
      if (info && info.size && info.size > 10 * 1024 * 1024) {
        wx.showToast({
          title: '图片不能超过10MB',
          icon: 'none',
          duration: 2000
        });
        return;
      }
    } catch (err) {
      // getFileInfo 失败不阻断发送
      console.warn('获取图片信息失败，继续发送:', err);
    }

    // 2. 立即在消息流里显示（本地临时路径，秒出）
    const tempId = 'img-' + Date.now();
    this.addMessage({
      id: tempId,
      isSelf: true,
      type: 'image',
      content: tempFilePath,
      from: '',
      fromName: '',
      time: Date.now(),
      status: 'sending' // 发送中
    });

    // 3. 调用底层 TIM SDK 发送
    try {
      const app = getApp();
      if (!app.appIMDelegate || !app.appIMDelegate.imHandler) {
        throw new Error('IM 处理器未就绪');
      }

      await app.appIMDelegate.imHandler.sendMsg({
        content: {
          type: 'image',
          to: this.data.friendID,
          content: tempFilePath  // TIM SDK 会读取这个临时文件并上传
        }
      });

      // 4. 发送成功，更新状态
      this.updateMessageStatus(tempId, 'sent');
      console.log('图片发送成功');
    } catch (err) {
      console.error('图片发送失败', err);
      this.updateMessageStatus(tempId, 'failed');
      wx.showToast({
        title: '图片发送失败',
        icon: 'none',
        duration: 2000
      });
    }
  },

  /**
   * 安全获取文件信息（wx.getFileInfo 在不同基础库可用性不同）
   */
  getFileInfoSafe(filePath) {
    return new Promise((resolve) => {
      if (typeof wx.getFileInfo !== 'function') {
        resolve(null);
        return;
      }
      wx.getFileInfo({
        filePath: filePath,
        success: (res) => resolve(res),
        fail: () => resolve(null)
      });
    });
  },

  /**
   * 更新消息状态（发送中 / 已发送 / 失败）
   */
  updateMessageStatus(messageId, status) {
    const messages = this.data.messages.map((m) => {
      if (m.id === messageId) {
        return Object.assign({}, m, { status: status });
      }
      return m;
    });
    this.setData({ messages: messages });
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
