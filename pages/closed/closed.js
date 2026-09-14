// pages/closed/closed.js
// 启动状态页：未到开放时段时展示倒计时与提示语；到点自动放行进入首页。
// 放行判定一律以服务端 getAppStatus 返回的 isOpen 为准，本地时间仅用于倒计时展示。
const POLL_INTERVAL = 20 * 1000

Page({
  data: {
    loaded: false,
    checking: false,
    message: '',
    countdown: '',
    scheduleText: '',
    nextOpenTime: 0
  },

  onLoad() {
    this._serverOffset = 0 // 服务端时间 - 本地时间
    this._entering = false
    this._checking = false
    this._needForce = false
    this._tickTimer = null
    this._pollTimer = null
  },

  onShow() {
    this.checkStatus()
  },

  onHide() {
    this.clearTimers()
  },

  onUnload() {
    this.clearTimers()
  },

  clearTimers() {
    if (this._tickTimer) {
      clearInterval(this._tickTimer)
      this._tickTimer = null
    }
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
  },

  onManualRefresh() {
    this._needForce = true
    this.checkStatus()
  },

  async checkStatus() {
    if (this._checking) return
    this._checking = true
    this.setData({ checking: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'getAppStatus',
        data: { force: !!this._needForce }
      })
      this._needForce = false
      const status = res && res.result

      // 云函数异常时放行，避免把用户挡在门外
      if (!status || status.code !== 0) {
        console.warn('开放状态异常，放行进入:', status)
        this.enterApp()
        return
      }

      // 用服务端时间校准本地时钟偏移（仅用于倒计时显示）
      this._serverOffset = (status.serverTime || Date.now()) - Date.now()

      if (status.isOpen) {
        this.enterApp()
        return
      }

      this.applyClosedStatus(status)
    } catch (e) {
      console.warn('获取开放状态失败，放行进入:', e)
      this.enterApp()
    } finally {
      this._checking = false
      this.setData({ checking: false })
    }
  },

  applyClosedStatus(status) {
    this.setData({
      loaded: true,
      message: status.message || '当前不在开放时间',
      scheduleText: status.todayWindowsText || '',
      nextOpenTime: status.nextOpenTime || 0
    })
    this.startTimers()
  },

  startTimers() {
    if (!this._tickTimer) {
      this.tick()
      this._tickTimer = setInterval(() => this.tick(), 1000)
    }
    if (!this._pollTimer) {
      this._pollTimer = setInterval(() => {
        this._needForce = true
        this.checkStatus()
      }, POLL_INTERVAL)
    }
  },

  tick() {
    const nextOpen = this.data.nextOpenTime
    if (!nextOpen) {
      if (this.data.countdown) this.setData({ countdown: '' })
      return
    }

    const remain = nextOpen - (Date.now() + this._serverOffset)
    if (remain <= 0) {
      // 到点：立即强制复查（绕过云函数短缓存）
      this.setData({ countdown: '00:00:00' })
      if (!this._checking) {
        this._needForce = true
        this.checkStatus()
      }
      return
    }

    this.setData({ countdown: this.formatDuration(remain) })
  },

  formatDuration(ms) {
    const total = Math.floor(ms / 1000)
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const seconds = total % 60
    return `${this.pad2(hours)}:${this.pad2(minutes)}:${this.pad2(seconds)}`
  },

  pad2(n) {
    return n < 10 ? '0' + n : '' + n
  },

  enterApp() {
    if (this._entering) return
    this._entering = true
    this.clearTimers()
    wx.switchTab({
      url: '/pages/chat-list/chat-list',
      fail: (e) => {
        console.error('进入首页失败:', e)
        this._entering = false
      }
    })
  }
})
