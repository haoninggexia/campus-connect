// pages/chat-room/chat-room.js
Page({
  data: {
    roomId: '',
    university: '',
    isCreator: false,
    userInfo: {},
    messages: [],
    otherUser: null,
    inputContent: '',
    pollingTimer: null,
    inactivityTimer: null,
    userProfiles: {}, // 存储用户的自定义资料
    showProfileModal: false,
    profileUser: null,
    profilePhotos: [],
    cachedTempAvatars: {}, // 缓存用户的临时下载链接，避免闪烁
    messagesLoaded: false // 标志：消息已加载
  },

  onLoad(options) {
    const { roomId, university, isCreator } = options
    const userInfo = wx.getStorageSync('user_info') || {}

    this.setData({
      roomId,
      university,
      isCreator: isCreator === 'true',
      userInfo
    })

    // 加载用户自定义资料
    this.loadUserProfiles()

    // 开始轮询消息
    this.startPolling()
  },

  /**
   * 加载用户自定义资料（仅加载基本信息，不获取临时链接）
   */
  async loadUserProfiles() {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('users_profile').get()

      console.log('加载用户资料结果:', res)

      if (res.data) {
        const profiles = {}
        res.data.forEach(profile => {
          profiles[profile.userID] = profile
        })
        this.setData({ userProfiles: profiles })
        console.log('userProfiles 已设置，数量:', Object.keys(profiles).length)
      }
    } catch (e) {
      console.error('加载用户资料失败', e)
    }
  },

  onUnload() {
    // 离开房间
    this.leaveRoom()
    this.stopPolling()
    this.clearInactivityTimer()
  },

  onShow() {
    // 确保消息区域正确显示
    if (this.data.messages.length > 0) {
      this.setData({ messagesLoaded: true })
    }
  },

  // 开始轮询
  startPolling() {
    this.loadMessages()
    this.data.pollingTimer = setInterval(() => {
      this.loadMessages()
    }, 3000) // 每3秒刷新一次
  },

  // 停止轮询
  stopPolling() {
    if (this.data.pollingTimer) {
      clearInterval(this.data.pollingTimer)
      this.setData({ pollingTimer: null })
    }
  },

  // 清理不活动计时器
  clearInactivityTimer() {
    if (this.data.inactivityTimer) {
      clearTimeout(this.data.inactivityTimer)
      this.setData({ inactivityTimer: null })
    }
  },

  // 重置不活动计时器
  resetInactivityTimer() {
    this.clearInactivityTimer()
    this.data.inactivityTimer = setTimeout(() => {
      // 3分钟不说话，自动离开
      this.leaveRoom()
      wx.showModal({
        title: '提示',
        content: '您已超过3分钟未发言，已自动退出聊天室',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
    }, 3 * 60 * 1000) // 3分钟
  },

  // 加载消息
  async loadMessages() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getMessages',
        data: {
          roomId: this.data.roomId
        }
      })

      if (res.result.code === 0) {
        const data = res.result.data

        // 确定对方用户信息
        let otherUser = null
        if (data.user1 && data.user1.userID !== this.data.userInfo.userID) {
          otherUser = data.user1
        } else if (data.user2 && data.user2.userID !== this.data.userInfo.userID) {
          otherUser = data.user2
        }

        // 缓存临时链接，避免每次轮询都更新导致头像闪烁
        const cachedTempAvatars = { ...this.data.cachedTempAvatars }
        let hasNewTempAvatar = false

        // 更新缓存，只在不存在时添加新链接
        if (data.user1 && data.user1.customAvatarTemp && !cachedTempAvatars[data.user1.userID]) {
          cachedTempAvatars[data.user1.userID] = data.user1.customAvatarTemp
          hasNewTempAvatar = true
        }
        if (data.user2 && data.user2.customAvatarTemp && !cachedTempAvatars[data.user2.userID]) {
          cachedTempAvatars[data.user2.userID] = data.user2.customAvatarTemp
          hasNewTempAvatar = true
        }

        // 为消息添加自定义头像
        const messages = data.messages.map(msg => {
          const newMsg = { ...msg, from: { ...msg.from } }
          // 使用缓存的临时链接
          if (cachedTempAvatars[msg.from.userID]) {
            newMsg.from.customAvatar = cachedTempAvatars[msg.from.userID]
          }
          // 确保保留原始头像
          if (!newMsg.from.avatarUrl) {
            newMsg.from.avatarUrl = 'https://thirdwx.qlogo.cn/mmopen/vi_32/POgEwh4mIHO4nibH0KlMECNjjGxQUq24ZEaGT4poC6icRiccVGKSyXwibcPq4BWmiaIGuG1icwxaQX6grC9VemZoJ8rg/132'
          }
          return newMsg
        })

        // 按照时间戳升序排序消息（最早的在最前，最新的在最后）
        messages.sort((a, b) => {
          const timeA = a.sendTime ? new Date(a.sendTime).getTime() : 0
          const timeB = b.sendTime ? new Date(b.sendTime).getTime() : 0
          return timeA - timeB // 升序排列，最早的消息在最前，最新的在最后
        })

        // 更新数据和缓存
        const updateData = {
          messages,
          otherUser,
          messagesLoaded: true
        }
        if (hasNewTempAvatar) {
          updateData.cachedTempAvatars = cachedTempAvatars
        }

        this.setData(updateData)

        // 确保消息区域正确显示
        if (messages.length > 0) {
          this.setData({ messagesLoaded: true })
        }

        // 滚动到底部（仅当消息数量变化时）
        if (data.messages.length !== this.data.messages.length) {
          // 延迟滚动到底部
          setTimeout(() => {
            wx.pageScrollTo({
              scrollTop: 99999,
              duration: 300
            })
          }, 100)
        }
      }
    } catch (e) {
      console.error('加载消息失败', e)
    }
  },

  // 输入内容变化
  onInputChange(e) {
    this.setData({
      inputContent: e.detail.value
    })
  },

  // 发送消息
  async onSend() {
    const content = this.data.inputContent.trim()
    if (!content) {
      wx.showToast({
        title: '请输入内容',
        icon: 'none'
      })
      return
    }

    wx.showLoading({ title: '发送中...' })
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          roomId: this.data.roomId,
          message: {
            from: this.data.userInfo,
            content: content,
            type: 'text'
          }
        }
      })

      wx.hideLoading()
      
      if (res.result.code === 0) {
        this.setData({ inputContent: '' })
        this.resetInactivityTimer()
        
        // 立即刷新消息
        this.loadMessages()
      } else {
        wx.showToast({
          title: res.result.msg || '发送失败',
          icon: 'none'
        })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('发送消息失败', e)
      wx.showToast({
        title: '发送失败',
        icon: 'none'
      })
    }
  },

  // 添加好友
  onAddFriend() {
    if (!this.data.otherUser) {
      wx.showToast({
        title: '对方已离开',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '添加好友',
      content: `确定要添加 ${this.data.otherUser.nickName} 为好友吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await wx.cloud.callFunction({
              name: 'friendOperation',
              data: {
                action: 'addFriend',
                friendID: this.data.otherUser.userID,
                friendRemark: this.data.otherUser.nickName
              }
            })

            if (result.result.code === 0) {
              wx.showToast({
                title: '好友请求已发送',
                icon: 'success'
              })
            } else {
              wx.showToast({
                title: result.result.msg || '发送失败',
                icon: 'none'
              })
            }
          } catch (e) {
            console.error('添加好友失败', e)
            wx.showToast({
              title: '添加失败',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  // 退出房间
  onLeave() {
    wx.showModal({
      title: '退出聊天',
      content: '确定要退出聊天室吗？',
      success: (res) => {
        if (res.confirm) {
          this.leaveRoom()
          wx.navigateBack()
        }
      }
    })
  },

  // 离开房间
  async leaveRoom() {
    try {
      await wx.cloud.callFunction({
        name: 'leaveRoom',
        data: {
          roomId: this.data.roomId,
          userID: this.data.userInfo.userID
        }
      })
    } catch (e) {
      console.error('离开房间失败', e)
    }
  },

  // 格式化时间
  formatTime(time) {
    const date = new Date(time)
    const hour = date.getHours().toString().padStart(2, '0')
    const minute = date.getMinutes().toString().padStart(2, '0')
    return `${hour}:${minute}`
  },

  // 判断是否是自己发送的消息
  isMyMessage(msg) {
    if (!msg.from || !this.data.userInfo) return false
    return String(msg.from.userID) === String(this.data.userInfo.userID)
  },

  // 头像加载失败
  onAvatarError(e) {
    const user = e.currentTarget.dataset.user
    console.log('头像加载失败:', user)
  },

  // 头像加载（已禁用日志）
  onAvatarLoad() {
    // 可以在这里添加头像加载完成后的逻辑
  },

  // 查看用户资料
  async onViewProfile(e) {
    const user = e.currentTarget.dataset.user
    if (!user || !user.userID) {
      return
    }

    const isSelf = user.userID === this.data.userInfo.userID

    if (isSelf) {
      // 查看自己的资料
      wx.showModal({
        title: '我的资料',
        content: `昵称：${user.nickName}\n大学：${user.university}\n专业：${user.major}\n\n点击"确定"进入个人页面编辑`,
        showCancel: true,
        confirmText: '去编辑',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({
              url: '/pages/my-profile/my-profile'
            })
          }
        }
      })
    } else {
      // 查看对方资料
      wx.showLoading({ title: '加载中...' })

      try {
        // 调用云函数获取用户资料的临时链接
        const res = await wx.cloud.callFunction({
          name: 'getUserProfile',
          data: {
            userID: user.userID
          }
        })

        wx.hideLoading()

        if (res.result.code === 0) {
          const profile = res.result.data
          const photosTemp = profile.photosTemp || []
          const customAvatarTemp = profile.customAvatarTemp || user.avatarUrl

          // 设置弹窗数据，合并完整资料
          this.setData({
            showProfileModal: true,
            profileUser: {
              ...user,
              ...profile,
              customAvatar: customAvatarTemp
            },
            profilePhotos: photosTemp
          })
        } else {
          wx.showToast({
            title: '加载失败',
            icon: 'none'
          })
        }
      } catch (e) {
        wx.hideLoading()
        console.error('获取用户资料失败:', e)
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
      }
    }
  },

  // 关闭资料弹窗
  onCloseProfileModal() {
    this.setData({
      showProfileModal: false,
      profileUser: null,
      profilePhotos: []
    })
  },

  // 预览照片
  onPreviewPhoto(e) {
    const current = e.currentTarget.dataset.url
    wx.previewImage({
      current: current,
      urls: this.data.profilePhotos
    })
  }
})
