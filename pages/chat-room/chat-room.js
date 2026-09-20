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
    cachedAvatarTimestamps: {}, // 缓存头像的时间戳，用于定期更新
    messagesLoaded: false, // 标志：消息已加载
    fontSize: 36, // 默认字体大小
    myLocation: null, // 当前用户的位置（从app获取）
    otherLocation: null, // 对方的位置
    distance: '', // 双方之间的距离
    isWaiting: false, // 是否处于等待状态（对方已离开，等待新用户加入）
    hadPartner: false, // 是否曾经有聊天伙伴（用于判断对方离开）
    uploading: false, // 是否正在上传图片
    inputMode: 'text', // 输入模式：'text' | 'voice'
    recording: false, // 是否正在录音
    recordingDuration: 0, // 当前录音累计秒数
    willCancel: false, // 是否处于"滑动取消"状态
    playingVoiceId: null // 正在播放的语音消息标识（sendTime 或 index）
  },

  onLoad(options) {
    console.log('聊天室页面 onLoad')
    const { roomId, university, isCreator } = options
    const userInfo = wx.getStorageSync('user_info') || {}
    console.log('当前用户信息:', userInfo)

    this.setData({
      roomId,
      university,
      isCreator: isCreator === 'true',
      userInfo
    })

    // 获取最新位置（每次进入聊天室都更新）
    this.getCurrentLocation()

    // 加载用户自定义资料
    this.loadUserProfiles()

    // 加载字体大小设置
    this.loadFontSizeSettings()

    // 开始轮询消息
    this.startPolling()

    // 初始化录音管理器
    this.setupRecorderManager()
  },

  // 获取当前位置（模糊定位，精度为公里级）
  getCurrentLocation() {
    wx.getFuzzyLocation({
      type: 'gcj02',
      success: (res) => {
        const location = {
          latitude: res.latitude,
          longitude: res.longitude
        }
        this.setData({
          myLocation: location
        })
        console.log('获取模糊位置成功:', location)
      },
      fail: (err) => {
        console.log('获取模糊位置失败（请确认已申请 getFuzzyLocation 接口权限）:', err)
      }
    })
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
        const cachedTempAvatars = { ...this.data.cachedTempAvatars }

        res.data.forEach(profile => {
          profiles[profile.userID] = profile
          // 如果有自定义头像，添加到缓存
          if (profile.customAvatar && !cachedTempAvatars[profile.userID]) {
            cachedTempAvatars[profile.userID] = profile.customAvatar
          }
        })

        this.setData({
          userProfiles: profiles,
          cachedTempAvatars
        })
        console.log('userProfiles 已设置，数量:', Object.keys(profiles).length)
        console.log('头像缓存已更新')
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
    this.cleanupRecorder()
    this.stopVoicePlayback()
  },

  onShow() {
    console.log('聊天室页面 onShow 被触发')
    // 确保消息区域正确显示
    if (this.data.messages.length > 0) {
      this.setData({ messagesLoaded: true })
    }

    // 重新加载字体大小设置
    this.loadFontSizeSettings()
  },

  // 加载字体大小设置
  loadFontSizeSettings() {
    const savedFontSize = wx.getStorageSync('chatFontSize')
    console.log('聊天室加载字体大小，保存的值:', savedFontSize)

    if (savedFontSize) {
      this.setData({
        fontSize: savedFontSize
      })
      this.updateFontSize(savedFontSize)
      console.log('聊天室字体大小已设置为:', savedFontSize)
    } else {
      console.log('没有保存的字体大小，使用默认值: 36')
    }
  },

  // 更新字体大小
  updateFontSize(size) {
    console.log('聊天室更新字体大小:', size)
    // 更新当前页面的字体大小
    this.setData({
      fontSize: size
    })
  },

  // 计算两点之间的距离（单位：千米）
  calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) {
      return null
    }

    const R = 6371 // 地球半径，单位：千米
    const dLat = this.toRad(lat2 - lat1)
    const dLon = this.toRad(lon2 - lon1)

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const distance = R * c

    return distance.toFixed(1) // 保留一位小数
  },

  // 角度转弧度
  toRad(deg) {
    return deg * (Math.PI / 180)
  },

  // 格式化距离显示
  formatDistance(distance) {
    if (!distance) return ''
    return `距离 ${distance}km`
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
    console.log('loadMessages 被调用，roomId:', this.data.roomId)
    try {
      const res = await wx.cloud.callFunction({
        name: 'getMessages',
        data: {
          roomId: this.data.roomId
        }
      })

      console.log('getMessages 云函数返回:', res.result)

      if (res.result.code === 0) {
        const data = res.result.data
        console.log('消息数据，消息数量:', data.messages ? data.messages.length : 0)

        // 确定对方用户信息
        let otherUser = null
        if (data.user1 && data.user1.userID !== this.data.userInfo.userID) {
          otherUser = data.user1
        } else if (data.user2 && data.user2.userID !== this.data.userInfo.userID) {
          otherUser = data.user2
        }

        // 检测对方离开或新用户加入
        const prevOtherUser = this.data.otherUser
        if (this.data.hadPartner && prevOtherUser && !otherUser) {
          // 对方已离开，进入等待状态
          wx.showToast({
            title: '对方已离开，等待新用户加入...',
            icon: 'none',
            duration: 3000
          })
          this.setData({
            isWaiting: true,
            distance: '' // 清除距离显示
          })
        } else if (!prevOtherUser && otherUser && !this.data.hadPartner) {
          // 首次有聊天伙伴加入
          this.setData({ hadPartner: true, isWaiting: false })
        } else if (this.data.isWaiting && otherUser) {
          // 等待状态下新用户加入
          wx.showToast({
            title: (otherUser.nickName || '新用户') + ' 加入了聊天室',
            icon: 'none',
            duration: 2000
          })
          this.setData({ isWaiting: false, hadPartner: true })
        }

        // 缓存临时链接，避免每次轮询都更新导致头像闪烁
        const cachedTempAvatars = { ...this.data.cachedTempAvatars }
        const cachedAvatarTimestamps = { ...this.data.cachedAvatarTimestamps }
        let hasNewTempAvatar = false
        const now = Date.now()
        const CACHE_EXPIRE_TIME = 10 * 60 * 1000 // 10分钟更新一次临时链接

        console.log('当前缓存头像:', Object.keys(cachedTempAvatars))
        console.log('返回的头像信息:', {
          user1: data.user1 ? { userID: data.user1.userID, hasTemp: !!data.user1.customAvatarTemp } : null,
          user2: data.user2 ? { userID: data.user2.userID, hasTemp: !!data.user2.customAvatarTemp } : null
        })

        // 更新缓存，在不存在或过期时添加新链接
        if (data.user1 && data.user1.customAvatarTemp) {
          const lastTimestamp = cachedAvatarTimestamps[data.user1.userID] || 0
          if (!cachedTempAvatars[data.user1.userID] || (now - lastTimestamp) > CACHE_EXPIRE_TIME) {
            cachedTempAvatars[data.user1.userID] = data.user1.customAvatarTemp
            cachedAvatarTimestamps[data.user1.userID] = now
            hasNewTempAvatar = true
            console.log('缓存/更新用户1头像:', data.user1.userID, data.user1.customAvatarTemp)
          }
        }
        if (data.user2 && data.user2.customAvatarTemp) {
          const lastTimestamp = cachedAvatarTimestamps[data.user2.userID] || 0
          if (!cachedTempAvatars[data.user2.userID] || (now - lastTimestamp) > CACHE_EXPIRE_TIME) {
            cachedTempAvatars[data.user2.userID] = data.user2.customAvatarTemp
            cachedAvatarTimestamps[data.user2.userID] = now
            hasNewTempAvatar = true
            console.log('缓存/更新用户2头像:', data.user2.userID, data.user2.customAvatarTemp)
          }
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

        // 计算距离
        if (otherUser && this.data.myLocation && !this.data.distance) {
          console.log('开始计算距离，对方用户:', otherUser.userID, '我的位置:', this.data.myLocation, '消息数量:', data.messages.length)
          // 打印所有消息的发送者和位置信息（使用JSON.stringify完整输出）
          console.log('所有消息详情:', JSON.stringify(data.messages.map(msg => ({
            fromUserID: msg.from?.userID,
            hasLocation: !!msg.location,
            location: msg.location
          })), null, 2))
          // 从最近的消息中获取对方位置
          const lastOtherMessage = [...data.messages].reverse().find(msg =>
            msg.from?.userID === otherUser.userID && msg.location && msg.location.latitude && msg.location.longitude
          )

          console.log('对方的最后一条消息:', lastOtherMessage ? '存在' : '不存在')

          if (lastOtherMessage && lastOtherMessage.location) {
            const calculatedDistance = this.calculateDistance(
              this.data.myLocation.latitude,
              this.data.myLocation.longitude,
              lastOtherMessage.location.latitude,
              lastOtherMessage.location.longitude
            )
            console.log('计算双方距离:', calculatedDistance, 'km')
            this.setData({
              distance: this.formatDistance(calculatedDistance)
            })
          } else {
            console.log('对方暂未发送位置信息')
          }
        }

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
          updateData.cachedAvatarTimestamps = cachedAvatarTimestamps
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
            type: 'text',
            location: this.data.myLocation // 添加位置信息
          }
        }
      })

      wx.hideLoading()
      
      if (res.result.code === 0) {
        this.setData({ inputContent: '' })
        this.resetInactivityTimer()
        
        // 立即刷新消息
        this.loadMessages()
      } else if (res.result.code === 403) {
        // 服务端判定已过开放时间，提示并返回状态页
        this.stopPolling()
        wx.showModal({
          title: '休息时间',
          content: res.result.msg || '当前不在开放时间',
          showCancel: false,
          confirmText: '知道了',
          success: () => {
            wx.reLaunch({ url: '/pages/closed/closed' })
          }
        })
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

  // ============ 图片发送功能 ============

  // 点击 "+" 按钮：弹出选择菜单
  onToggleExtra() {
    wx.showActionSheet({
      itemList: ['从相册选择', '拍照'],
      success: (res) => {
        const source = res.tapIndex === 1 ? 'camera' : 'album'
        this.chooseAndSendImage(source)
      },
      fail: () => {
        // 用户取消，无需处理
      }
    })
  },

  // 选择图片并发送
  chooseAndSendImage(source) {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'], // 压缩图，降低上传耗时
      sourceType: [source === 'camera' ? 'camera' : 'album'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths && res.tempFilePaths[0]
        if (!tempFilePath) {
          wx.showToast({ title: '未选择图片', icon: 'none' })
          return
        }
        this.uploadAndSendImage(tempFilePath)
      },
      fail: (err) => {
        console.error('选择图片失败:', err)
        wx.showToast({ title: '选择图片失败', icon: 'none' })
      }
    })
  },

  // 上传图片到云存储并发送图片消息
  async uploadAndSendImage(tempFilePath) {
    if (this.data.uploading) return

    // 大小检查（微信单文件上限 10MB）
    try {
      const info = await new Promise((resolve) => {
        if (typeof wx.getFileInfo !== 'function') {
          resolve(null)
          return
        }
        wx.getFileInfo({
          filePath: tempFilePath,
          success: (r) => resolve(r),
          fail: () => resolve(null)
        })
      })
      if (info && info.size && info.size > 10 * 1024 * 1024) {
        wx.showToast({ title: '图片不能超过10MB', icon: 'none', duration: 2000 })
        return
      }
    } catch (e) {
      // 获取文件信息失败不阻断发送
    }

    this.setData({ uploading: true })
    wx.showLoading({ title: '发送中...', mask: true })

    try {
      // 1. 上传到云存储
      const ext = (tempFilePath.split('.').pop() || 'png').toLowerCase()
      const cloudPath = `chat_images/${this.data.roomId}/${Date.now()}_${Math.floor(Math.random() * 100000)}.${ext}`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: tempFilePath
      })
      const fileID = uploadRes.fileID
      console.log('图片上传成功，fileID:', fileID)

      // 2. 调用云函数发送图片消息（content 存 fileID，type 标记为 image）
      const res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          roomId: this.data.roomId,
          message: {
            from: this.data.userInfo,
            content: fileID,
            type: 'image',
            location: this.data.myLocation
          }
        }
      })

      wx.hideLoading()

      if (res.result.code === 0) {
        this.resetInactivityTimer()
        // 立即刷新消息
        this.loadMessages()
      } else if (res.result.code === 403) {
        this.stopPolling()
        wx.showModal({
          title: '休息时间',
          content: res.result.msg || '当前不在开放时间',
          showCancel: false,
          confirmText: '知道了',
          success: () => {
            wx.reLaunch({ url: '/pages/closed/closed' })
          }
        })
      } else {
        wx.showToast({
          title: res.result.msg || '发送失败',
          icon: 'none'
        })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('图片发送失败:', e)
      wx.showToast({
        title: '图片发送失败',
        icon: 'none',
        duration: 2000
      })
    } finally {
      this.setData({ uploading: false })
    }
  },

  // 预览图片
  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.previewImage({
      current: url,
      urls: [url]
    })
  },

  // ============ 语音发送功能 ============

  /**
   * 初始化全局录音管理器（只在 onLoad 调用一次）
   */
  setupRecorderManager() {
    if (this.recorderManager) return
    this.recorderManager = wx.getRecorderManager()
    this._recorderActuallyStarted = false // onStart 之后才置 true

    this.recorderManager.onStart(() => {
      console.log('录音开始')
      this._recorderActuallyStarted = true
      this.setData({
        recording: true,
        recordingDuration: 0,
        willCancel: false
      })
      // 每秒更新时长
      if (this.recordingTimer) clearInterval(this.recordingTimer)
      this.recordingTimer = setInterval(() => {
        this.setData({ recordingDuration: this.data.recordingDuration + 1 })
      }, 1000)
    })

    this.recorderManager.onStop((res) => {
      console.log('录音停止', res)
      this._recorderActuallyStarted = false
      if (this.recordingTimer) {
        clearInterval(this.recordingTimer)
        this.recordingTimer = null
      }

      const wasCancelled = this.data.willCancel
      const tempFilePath = res && res.tempFilePath
      // res.duration 单位：毫秒；fallback 用秒表累计*1000
      const durationMs = (res && res.duration) || (this.data.recordingDuration * 1000)

      this.setData({
        recording: false,
        willCancel: false,
        recordingDuration: 0
      })

      if (wasCancelled) {
        console.log('用户取消发送')
        return
      }
      if (!tempFilePath) {
        console.warn('录音文件为空')
        return
      }
      if (durationMs < 800) {
        wx.showToast({ title: '录音时间太短', icon: 'none' })
        return
      }

      const durationSec = Math.max(1, Math.ceil(durationMs / 1000))
      this.uploadAndSendVoice(tempFilePath, durationSec)
    })

    this.recorderManager.onError((err) => {
      console.error('录音错误:', err)
      this._recorderActuallyStarted = false
      if (this.recordingTimer) {
        clearInterval(this.recordingTimer)
        this.recordingTimer = null
      }
      this.setData({
        recording: false,
        willCancel: false,
        recordingDuration: 0
      })
      wx.showToast({ title: '录音失败', icon: 'none' })
    })
  },

  /**
   * 清理录音资源（onUnload 调用）
   */
  cleanupRecorder() {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer)
      this.recordingTimer = null
    }
    if (this.recorderManager && this._recorderActuallyStarted) {
      try { this.recorderManager.stop() } catch (e) {}
    }
  },

  /**
   * 切换文本/语音输入模式
   */
  onToggleInputMode() {
    if (this.data.recording) {
      wx.showToast({ title: '请先结束录音', icon: 'none' })
      return
    }
    wx.hideKeyboard()
    this.setData({ inputMode: this.data.inputMode === 'text' ? 'voice' : 'text' })
  },

  /**
   * 按住：开始录音
   */
  onVoiceTouchStart(e) {
    if (this.data.recording) return
    // 记录起始 Y 坐标（用于滑动取消判断）
    const t = e.touches && e.touches[0]
    this._voiceStartY = t ? t.clientY : 0
    this._voiceWantsToRecord = true
    this.setData({ willCancel: false })

    // 请求麦克风权限
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        // 权限通过后再次检查：用户可能已经松手
        if (!this._voiceWantsToRecord) {
          console.log('权限通过但用户已松手，放弃本次录音')
          return
        }
        try {
          this.recorderManager.start({
            format: 'mp3',
            duration: 60000, // 最长 60 秒
            sampleRate: 16000,
            numberOfChannels: 1,
            encodeBitRate: 48000
          })
        } catch (e) {
          console.error('启动录音失败:', e)
          this._voiceWantsToRecord = false
          wx.showToast({ title: '启动录音失败', icon: 'none' })
        }
      },
      fail: () => {
        this._voiceWantsToRecord = false
        wx.showModal({
          title: '需要麦克风权限',
          content: '请在设置中开启麦克风权限后重试',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) wx.openSetting()
          }
        })
      }
    })
  },

  /**
   * 滑动：检测是否进入"取消"状态
   */
  onVoiceTouchMove(e) {
    if (!this.data.recording || !this._voiceStartY) return
    const t = e.touches && e.touches[0]
    if (!t) return
    const diff = this._voiceStartY - t.clientY // 向上滑为正
    const shouldCancel = diff > 80 || diff < -80
    if (shouldCancel !== this.data.willCancel) {
      // 进入/退出取消态时震动一下，给用户反馈
      if (shouldCancel) {
        try { wx.vibrateShort({ type: 'light' }) } catch (e) {}
      }
      this.setData({ willCancel: shouldCancel })
    }
  },

  /**
   * 松开：结束录音（onStop 回调会根据 willCancel 决定是否发送）
   */
  onVoiceTouchEnd() {
    this._voiceStartY = null
    this._voiceWantsToRecord = false
    if (this._recorderActuallyStarted) {
      try {
        this.recorderManager.stop()
      } catch (e) {
        console.warn('停止录音失败:', e)
      }
    }
  },

  /**
   * 上传语音到云存储并发送
   */
  async uploadAndSendVoice(tempFilePath, duration) {
    if (this.data.uploading) return

    // 大小检查（微信单文件上限 10MB）
    try {
      const info = await new Promise((resolve) => {
        if (typeof wx.getFileInfo !== 'function') {
          resolve(null)
          return
        }
        wx.getFileInfo({
          filePath: tempFilePath,
          success: (r) => resolve(r),
          fail: () => resolve(null)
        })
      })
      if (info && info.size && info.size > 10 * 1024 * 1024) {
        wx.showToast({ title: '语音不能超过10MB', icon: 'none', duration: 2000 })
        return
      }
    } catch (e) {
      // 不阻断发送
    }

    this.setData({ uploading: true })
    wx.showLoading({ title: '发送中...', mask: true })

    try {
      // 1. 上传到云存储
      const cloudPath = `chat_voices/${this.data.roomId}/${Date.now()}_${Math.floor(Math.random() * 100000)}.mp3`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: tempFilePath
      })
      const fileID = uploadRes.fileID
      console.log('语音上传成功，fileID:', fileID, 'duration:', duration)

      // 2. 调用云函数发送语音消息
      const res = await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          roomId: this.data.roomId,
          message: {
            from: this.data.userInfo,
            content: fileID,
            type: 'voice',
            duration: duration,
            location: this.data.myLocation
          }
        }
      })

      wx.hideLoading()

      if (res.result.code === 0) {
        this.resetInactivityTimer()
        this.loadMessages()
      } else if (res.result.code === 403) {
        this.stopPolling()
        wx.showModal({
          title: '休息时间',
          content: res.result.msg || '当前不在开放时间',
          showCancel: false,
          confirmText: '知道了',
          success: () => {
            wx.reLaunch({ url: '/pages/closed/closed' })
          }
        })
      } else {
        wx.showToast({
          title: res.result.msg || '发送失败',
          icon: 'none'
        })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('语音发送失败:', e)
      wx.showToast({
        title: '语音发送失败',
        icon: 'none',
        duration: 2000
      })
    } finally {
      this.setData({ uploading: false })
    }
  },

  /**
   * 点击语音气泡：播放 / 暂停
   */
  onPlayVoice(e) {
    const url = e.currentTarget.dataset.url
    const msgId = e.currentTarget.dataset.msgId
    const duration = parseInt(e.currentTarget.dataset.duration, 10) || 1

    if (!url) {
      wx.showToast({ title: '语音加载失败', icon: 'none' })
      return
    }

    // 已在播放这条 → 停止
    if (this.data.playingVoiceId === msgId) {
      this.stopVoicePlayback()
      return
    }

    // 切到另一条播放 → 先停掉上一条
    this.stopVoicePlayback()

    // 每次播放使用独立 token，旧实例迟到的 onStop/onError 回调不生效
    const token = (this._voicePlayToken = (this._voicePlayToken || 0) + 1)
    const ctx = wx.createInnerAudioContext()
    this.audioContext = ctx
    this._voiceActive = true

    ctx.onPlay(() => {
      if (this._voicePlayToken === token) this._voiceActive = true
    })
    ctx.onCanplay(() => {
      // 用真实音频时长校准兜底定时器，避免消息里 duration 不准导致提前清除状态
      if (this._voicePlayToken !== token) return
      const real = ctx.duration
      if (real && real > 0) {
        if (this._voicePlayingTimer) {
          clearTimeout(this._voicePlayingTimer)
        }
        this._voicePlayingTimer = setTimeout(() => {
          if (this._voicePlayToken === token) this.clearVoicePlayingState()
        }, real * 1000 + 3000)
      }
    })
    ctx.onEnded(() => {
      if (this._voicePlayToken === token) this.clearVoicePlayingState()
    })
    ctx.onStop(() => {
      if (this._voicePlayToken === token) this.clearVoicePlayingState()
    })
    ctx.onError((err) => {
      if (this._voicePlayToken !== token) return
      const errMsg = (err && err.errMsg) || ''
      // 空闲状态下 stop() 失败属正常现象，不视为播放失败
      if (errMsg.indexOf('stop audio fail') !== -1) {
        this.clearVoicePlayingState()
        return
      }
      console.error('语音播放失败:', err)
      this.clearVoicePlayingState()
      wx.showToast({ title: '播放失败', icon: 'none' })
    })

    this.setData({ playingVoiceId: msgId })
    ctx.src = url
    ctx.play()

    // 兜底：若 onEnded 未触发，时长+1.5s 后强制清除状态
    this._voicePlayingTimer = setTimeout(() => {
      if (this._voicePlayToken === token) this.clearVoicePlayingState()
    }, duration * 1000 + 1500)
  },

  /**
   * 清除播放中状态（内部使用）
   */
  clearVoicePlayingState() {
    this._voiceActive = false
    if (this._voicePlayingTimer) {
      clearTimeout(this._voicePlayingTimer)
      this._voicePlayingTimer = null
    }
    if (this.data.playingVoiceId !== null) {
      this.setData({ playingVoiceId: null })
    }
  },

  /**
   * 停止播放（内部使用）
   */
  stopVoicePlayback() {
    // 递增 token 使旧实例的所有回调失效
    this._voicePlayToken = (this._voicePlayToken || 0) + 1
    this._voiceActive = false
    if (this.audioContext) {
      try { this.audioContext.stop() } catch (e) {}
      try { this.audioContext.destroy() } catch (e) {}
      this.audioContext = null
    }
    this.clearVoicePlayingState()
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
    console.log('头像加载失败，用户信息:', user)
  },

  // 头像加载（已禁用日志）
  onAvatarLoad() {
    // 可以在这里添加头像加载完成后的逻辑
  },

  // 查看用户资料
  async onViewProfile(e) {
    console.log('点击头像查看资料，事件对象:', e)
    const user = e.currentTarget.dataset.user
    console.log('用户信息:', user)

    if (!user || !user.userID) {
      console.log('用户信息无效，取消操作')
      return
    }

    // 从缓存中获取头像
    const cachedAvatar = this.data.cachedTempAvatars[user.userID] || user.customAvatar || user.avatarUrl
    const isSelf = user.userID === this.data.userInfo.userID
    console.log('是否为自己的资料:', isSelf)
    console.log('缓存头像:', cachedAvatar)

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
        const photosTemp = (profile.photosTemp || []).filter(p => p && typeof p === 'string' && p.trim() !== '')
        const bio = profile.bio || ''
        const nickName = profile.nickName || user.nickName || '微信用户'
        const customAvatar = profile.customAvatarTemp || cachedAvatar

        console.log('用户资料:', {
          nickName,
          bio,
          photosCount: photosTemp.length,
          customAvatar
        })

        // 显示自定义模态框
        this.setData({
          showProfileModal: true,
          profileUser: {
            userID: user.userID,
            nickName,
            bio,
            customAvatar,
            isSelf
          },
          profilePhotos: photosTemp
        })
      } else {
        // 云函数失败，使用本地数据
        console.log('云函数返回失败，使用本地数据')
        this.setData({
          showProfileModal: true,
          profileUser: {
            userID: user.userID,
            nickName: user.nickName || '微信用户',
            bio: '',
            customAvatar: cachedAvatar,
            isSelf
          },
          profilePhotos: []
        })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('获取用户资料失败:', e)
        // 使用本地数据
        this.setData({
          showProfileModal: true,
          profileUser: {
            userID: user.userID,
            nickName: user.nickName || '微信用户',
            bio: '',
            customAvatar: cachedAvatar,
            isSelf
          },
          profilePhotos: []
        })
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
  },

  // 字体大小设置
  onFontSizeSettings() {
    wx.navigateTo({
      url: '/pages/font-size/font-size'
    })
  }
})
