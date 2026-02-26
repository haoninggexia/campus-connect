// pages/rooms-list/rooms-list.js
Page({
  data: {
    universities: ['北京大学', '清华大学', '复旦大学', '上海交通大学', '浙江大学', '南京大学', '中山大学', '武汉大学'],
    currentUniversity: '',
    rooms: [],
    userInfo: {},
    loading: false,
    pollingTimer: null
  },

  onLoad(options) {
    // 获取用户信息
    const userInfo = wx.getStorageSync('user_info') || {}
    this.setData({
      userInfo,
      currentUniversity: userInfo.university || this.data.universities[0]
    })

    // 开始轮询房间列表
    this.startPolling()
  },

  onUnload() {
    // 停止轮询
    this.stopPolling()
  },

  // 开始轮询
  startPolling() {
    this.loadRooms()
    this.data.pollingTimer = setInterval(() => {
      this.loadRooms()
    }, 3000) // 每3秒刷新一次
  },

  // 停止轮询
  stopPolling() {
    if (this.data.pollingTimer) {
      clearInterval(this.data.pollingTimer)
      this.setData({ pollingTimer: null })
    }
  },

  // 切换大学
  onSwitchUniversity(e) {
    const university = e.currentTarget.dataset.university
    this.setData({ currentUniversity: university })
    this.loadRooms()
  },

  // 加载房间列表
  async loadRooms() {
    this.setData({ loading: true })
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'getAvailableRooms',
        data: {
          university: this.data.currentUniversity
        }
      })

      if (res.result.code === 0) {
        this.setData({ rooms: res.result.data })
      }
    } catch (e) {
      console.error('加载房间列表失败', e)
    } finally {
      this.setData({ loading: false })
    }
  },

  // 创建新房间
  async onCreateRoom() {
    wx.showLoading({ title: '创建中...' })
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'enterRoom',
        data: {
          university: this.data.currentUniversity,
          userInfo: this.data.userInfo
        }
      })

      wx.hideLoading()
      
      if (res.result.code === 0) {
        const roomData = res.result.data
        wx.navigateTo({
          url: `/pages/chat-room/chat-room?roomId=${roomData.roomId}&university=${this.data.currentUniversity}&isCreator=true`
        })
      } else {
        wx.showToast({
          title: res.result.msg || '创建失败',
          icon: 'none'
        })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('创建房间失败', e)
      wx.showToast({
        title: '创建失败',
        icon: 'none'
      })
    }
  },

  // 进入房间
  async onEnterRoom(e) {
    const roomId = e.currentTarget.dataset.roomid
    const room = this.data.rooms.find(r => r._id === roomId)
    
    if (!room) return
    
    // 如果房间已满，不能进入
    if (room.status === 2) {
      wx.showToast({
        title: '房间已满，请选择其他房间',
        icon: 'none'
      })
      return
    }
    
    wx.showLoading({ title: '进入中...' })
    
    try {
      console.log('调用enterRoom云函数，参数:', { roomId, university: this.data.currentUniversity, userInfo: this.data.userInfo })
      
      const res = await wx.cloud.callFunction({
        name: 'enterRoom',
        data: {
          roomId,
          university: this.data.currentUniversity,
          userInfo: this.data.userInfo
        }
      })

      wx.hideLoading()
      
      console.log('enterRoom云函数返回:', res)
      console.log('云函数返回详情:', JSON.stringify(res.result, null, 2))
      
      if (res.result.code === 0) {
        console.log('进入房间成功，跳转到聊天页面')
        wx.navigateTo({
          url: `/pages/chat-room/chat-room?roomId=${roomId}&university=${this.data.currentUniversity}&isCreator=false`
        })
      } else {
        console.error('进入房间失败:', res.result.msg)
        console.error('错误详情:', res.result)
        wx.showToast({
          title: res.result.msg || '进入失败',
          icon: 'none',
          duration: 3000
        })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('进入房间异常:', e)
      wx.showToast({
        title: '进入失败: ' + (e.errMsg || '未知错误'),
        icon: 'none',
        duration: 3000
      })
    }
  },

  // 获取房间状态文字
  getStatusText(status) {
    switch(status) {
      case 0: return '空闲'
      case 1: return '等待中 (1/2)'
      case 2: return '聊天中 (2/2)'
      default: return '未知'
    }
  },

  // 获取房间状态颜色
  getStatusColor(status) {
    switch(status) {
      case 0: return '#999'
      case 1: return '#07c160'
      case 2: return '#ff5252'
      default: return '#999'
    }
  }
})
