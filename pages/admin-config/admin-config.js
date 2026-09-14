// pages/admin-config/admin-config.js
// 隐藏管理页：手机端直接修改开放时间配置。
// 入口隐藏在「状态页长按 LOGO」与「我的页连续点击版本号 7 次」，进入后需密码校验。
// 真正的写权限由云函数 adminConfig 把关（密码 + openid 白名单 + 失败锁定）。
const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]

const REASON_TEXT = {
  open: '开放中',
  before_open: '未到开放时间',
  after_close: '今日时段已结束',
  holiday_closed: '特殊日期关闭',
  disabled: '不限时段（全天开放）'
}

Page({
  data: {
    // 登录
    verified: false,
    pwd: '',
    logging: false,
    hint: '',
    lockTip: '',

    // 环境信息
    openid: '',
    whitelistCount: 0,
    serverTimeStr: '',

    // 实时状态
    status: null,
    statusReasonText: '',
    statusChecking: false,

    // 表单
    enabled: true,
    message: '',
    windows: [],
    overrides: [],
    weekLabels: WEEK_LABELS,
    allDays: ALL_DAYS,

    saving: false
  },

  onLoad() {
    this._pwd = ''
    this.ping()
  },

  onPullDownRefresh() {
    const done = () => wx.stopPullDownRefresh()
    if (this.data.verified) {
      Promise.all([this.loadConfig(true), this.refreshStatus()]).then(done, done)
    } else {
      this.ping().then(done, done)
    }
  },

  // ==================== 登录 ====================

  ping() {
    return wx.cloud.callFunction({
      name: 'adminConfig',
      data: { action: 'ping' }
    }).then((res) => {
      const r = (res && res.result) || {}
      const tip = []
      if (r.bootstrapped) {
        tip.push(`首次使用，默认密码：${r.defaultPasswordHint || '(见文档)'}`)
      }
      if (r.persistFailed) {
        tip.push('警告：admin 配置写入数据库失败，改密码可能不生效')
      }
      if (r.whitelistCount > 0) {
        tip.push(`已开启 openid 白名单（${r.whitelistCount} 个）`)
      }
      if (r.locked) {
        tip.push(`已锁定，约 ${Math.ceil((r.lockedRemainMs || 0) / 60000)} 分钟后可重试`)
      }

      this.setData({
        openid: r.openid || '',
        whitelistCount: r.whitelistCount || 0,
        lockTip: tip.join('；')
      })

      if (r.allowed === false) {
        this.setData({ hint: '当前账号不在管理白名单内，无法进入' })
      }
      return r
    }).catch((e) => {
      console.error('ping 失败:', e)
      this.setData({ lockTip: '云函数 adminConfig 调用失败，请确认已部署' })
      return null
    })
  },

  onPwdInput(e) {
    this._pwd = e.detail.value
    this.setData({ pwd: e.detail.value })
  },

  onLogin() {
    if (!this._pwd) {
      wx.showToast({ title: '请输入管理密码', icon: 'none' })
      return
    }
    this.setData({ logging: true, hint: '' })

    wx.cloud.callFunction({
      name: 'adminConfig',
      data: { action: 'login', password: this._pwd }
    }).then((res) => {
      const r = (res && res.result) || {}
      if (r.code === 0) {
        this.setData({
          verified: true,
          logging: false,
          hint: '',
          lockTip: ''
        })
        wx.showToast({ title: '登录成功', icon: 'success' })
        this.loadConfig(true)
        this.refreshStatus()
        return
      }
      this.setData({ logging: false, hint: r.msg || '登录失败' })
      wx.vibrateShort({ type: 'medium', fail: () => {} })
    }).catch((e) => {
      console.error('登录异常:', e)
      this.setData({ logging: false, hint: '调用失败：' + (e.errMsg || '未知错误') })
    })
  },

  onLogout() {
    this._pwd = ''
    this.setData({
      verified: false,
      pwd: '',
      hint: '',
      windows: [],
      overrides: [],
      status: null
    })
  },

  // ==================== 状态 ====================

  refreshStatus() {
    this.setData({ statusChecking: true })
    return wx.cloud.callFunction({
      name: 'getAppStatus',
      data: { force: true }
    }).then((res) => {
      const s = (res && res.result) || {}
      if (s.code !== 0) {
        this.setData({ statusChecking: false })
        return
      }
      this.setData({
        status: s,
        serverTimeStr: s.serverTimeStr || '',
        statusReasonText: REASON_TEXT[s.reason] || s.reason || '',
        statusChecking: false
      })
    }).catch((e) => {
      console.warn('获取状态失败:', e)
      this.setData({ statusChecking: false })
    })
  },

  // ==================== 读取配置 ====================

  loadConfig(showLoading) {
    if (showLoading) wx.showLoading({ title: '加载中...' })

    return wx.cloud.callFunction({
      name: 'adminConfig',
      data: { action: 'get', password: this._pwd }
    }).then((res) => {
      if (showLoading) wx.hideLoading()
      const r = (res && res.result) || {}

      if (r.code !== 0) {
        this.setData({ verified: false, hint: r.msg || '读取配置失败' })
        return
      }

      const data = r.data || {}
      const windows = (data.windows || []).map((win, idx) => ({
        id: 'w' + idx,
        days: Array.isArray(win.days) ? win.days.slice() : [],
        start: win.start || '21:00',
        end: win.end || '23:00'
      }))

      const overrides = Object.keys(data.datesOverride || {}).sort().map((date, idx) => {
        const item = data.datesOverride[date] || {}
        return {
          id: 'o' + idx,
          date,
          closed: !!item.closed,
          message: item.message || ''
        }
      })

      this.setData({
        verified: true,
        enabled: data.enabled !== false,
        message: data.message || '',
        windows: windows.length ? windows : [{ id: 'w0', days: ALL_DAYS.slice(), start: '21:00', end: '23:00' }],
        overrides,
        updateTimeStr: data.updateTime || ''
      })
    }).catch((e) => {
      if (showLoading) wx.hideLoading()
      console.error('读取配置异常:', e)
      this.setData({ hint: '读取失败：' + (e.errMsg || '未知错误') })
    })
  },

  // ==================== 表单编辑 ====================

  onToggleEnabled(e) {
    this.setData({ enabled: e.detail.value })
  },

  onMessageInput(e) {
    this.setData({ message: e.detail.value })
  },

  onDaysTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    const day = Number(e.currentTarget.dataset.day)
    const windows = this.data.windows.slice()
    const win = windows[index]
    if (!win) return

    const days = win.days.slice()
    const pos = days.indexOf(day)
    if (pos === -1) {
      days.push(day)
    } else {
      days.splice(pos, 1)
    }
    days.sort((a, b) => a - b)

    windows[index] = Object.assign({}, win, { days })
    this.setData({ windows })
  },

  onPickAllDays(e) {
    const index = Number(e.currentTarget.dataset.index)
    const windows = this.data.windows.slice()
    const win = windows[index]
    if (!win) return
    const all = win.days.length === 7
    windows[index] = Object.assign({}, win, { days: all ? [] : ALL_DAYS.slice() })
    this.setData({ windows })
  },

  onStartChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    const windows = this.data.windows.slice()
    windows[index] = Object.assign({}, windows[index], { start: e.detail.value })
    this.setData({ windows })
  },

  onEndChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    const windows = this.data.windows.slice()
    windows[index] = Object.assign({}, windows[index], { end: e.detail.value })
    this.setData({ windows })
  },

  onAddWindow() {
    if (this.data.windows.length >= 6) {
      wx.showToast({ title: '最多 6 个时段', icon: 'none' })
      return
    }
    const windows = this.data.windows.concat([{
      id: 'w' + Date.now(),
      days: ALL_DAYS.slice(),
      start: '21:00',
      end: '23:00'
    }])
    this.setData({ windows })
  },

  onRemoveWindow(e) {
    const index = Number(e.currentTarget.dataset.index)
    const windows = this.data.windows.slice()
    windows.splice(index, 1)
    this.setData({ windows })
  },

  // ==================== 特殊日期 ====================

  onDateChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    const overrides = this.data.overrides.slice()
    overrides[index] = Object.assign({}, overrides[index], { date: e.detail.value })
    this.setData({ overrides })
  },

  onDateClosedChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    const overrides = this.data.overrides.slice()
    overrides[index] = Object.assign({}, overrides[index], { closed: e.detail.value })
    this.setData({ overrides })
  },

  onDateMessageInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const overrides = this.data.overrides.slice()
    overrides[index] = Object.assign({}, overrides[index], { message: e.detail.value })
    this.setData({ overrides })
  },

  onAddOverride() {
    if (this.data.overrides.length >= 10) {
      wx.showToast({ title: '最多 10 条特殊日期', icon: 'none' })
      return
    }
    const today = this.formatDate(new Date())
    const overrides = this.data.overrides.concat([{
      id: 'o' + Date.now(),
      date: today,
      closed: true,
      message: ''
    }])
    this.setData({ overrides })
  },

  onRemoveOverride(e) {
    const index = Number(e.currentTarget.dataset.index)
    const overrides = this.data.overrides.slice()
    overrides.splice(index, 1)
    this.setData({ overrides })
  },

  formatDate(d) {
    const pad = n => (n < 10 ? '0' + n : '' + n)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  },

  // ==================== 保存 / 重置 / 改密码 ====================

  buildConfig() {
    const datesOverride = {}
    this.data.overrides.forEach(item => {
      if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(item.date || '')) return
      const one = {}
      if (item.closed) one.closed = true
      if (item.message && item.message.trim()) one.message = item.message.trim()
      if (Object.keys(one).length) datesOverride[item.date] = one
    })

    return {
      enabled: this.data.enabled,
      message: this.data.message || '',
      windows: this.data.windows.map(win => ({
        days: win.days || [],
        start: win.start,
        end: win.end
      })),
      datesOverride
    }
  },

  onSave() {
    const config = this.buildConfig()

    if (config.windows.length === 0) {
      wx.showToast({ title: '至少保留一个时段', icon: 'none' })
      return
    }
    for (const win of config.windows) {
      if (win.start === win.end) {
        wx.showToast({ title: `${win.start} 起止时间相同，请修正`, icon: 'none' })
        return
      }
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...' })

    wx.cloud.callFunction({
      name: 'adminConfig',
      data: { action: 'save', password: this._pwd, config }
    }).then((res) => {
      wx.hideLoading()
      this.setData({ saving: false })
      const r = (res && res.result) || {}
      if (r.code === 0) {
        this.setData({ updateTimeStr: (r.data && r.data.updateTime) || '' })
        wx.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(() => this.refreshStatus(), 1200)
        return
      }
      if (r.code === 401 || r.code === 429) {
        this.setData({ verified: false, hint: r.msg || '登录已失效' })
      }
      wx.showModal({ title: '保存失败', content: r.msg || '未知错误', showCancel: false })
    }).catch((e) => {
      wx.hideLoading()
      this.setData({ saving: false })
      wx.showModal({ title: '保存异常', content: e.errMsg || '网络错误', showCancel: false })
    })
  },

  onReset() {
    wx.showModal({
      title: '恢复默认配置',
      content: '将重置为：每晚 21:00 - 23:00，全周生效，并清空特殊日期。确定继续？',
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '重置中...' })
        wx.cloud.callFunction({
          name: 'adminConfig',
          data: { action: 'reset', password: this._pwd }
        }).then((r) => {
          wx.hideLoading()
          const result = (r && r.result) || {}
          if (result.code === 0) {
            wx.showToast({ title: '已恢复默认', icon: 'success' })
            this.loadConfig(false)
            this.refreshStatus()
            return
          }
          wx.showModal({ title: '重置失败', content: result.msg || '未知错误', showCancel: false })
        }).catch((e) => {
          wx.hideLoading()
          wx.showModal({ title: '重置异常', content: e.errMsg || '网络错误', showCancel: false })
        })
      }
    })
  },

  onChangePassword() {
    wx.showModal({
      title: '修改管理密码',
      editable: true,
      placeholderText: '输入新密码（至少 6 位）',
      success: (res) => {
        if (!res.confirm) return
        const newPassword = (res.content || '').trim()
        if (newPassword.length < 6) {
          wx.showToast({ title: '密码至少 6 位', icon: 'none' })
          return
        }
        wx.showLoading({ title: '提交中...' })
        wx.cloud.callFunction({
          name: 'adminConfig',
          data: { action: 'changePassword', password: this._pwd, newPassword }
        }).then((r) => {
          wx.hideLoading()
          const result = (r && r.result) || {}
          if (result.code === 0) {
            wx.showModal({
              title: '修改成功',
              content: `新密码：${result.password}\n请牢记，下次进入管理页使用。`,
              showCancel: false
            })
            this._pwd = ''
            this.setData({ verified: false, pwd: '' })
            return
          }
          wx.showModal({ title: '修改失败', content: result.msg || '未知错误', showCancel: false })
        }).catch((e) => {
          wx.hideLoading()
          wx.showModal({ title: '修改异常', content: e.errMsg || '网络错误', showCancel: false })
        })
      }
    })
  },

  onBindOpenid() {
    const isBound = this.data.whitelistCount > 0
    const actionText = isBound ? '把本机 openid 加入白名单（覆盖式追加）' : '启用 openid 白名单（仅本机可进）'

    wx.showModal({
      title: 'openid 白名单',
      content: `${actionText}\n\n当前 openid：\n${this.data.openid}`,
      confirmText: '确认',
      success: (res) => {
        if (!res.confirm) return
        wx.cloud.callFunction({
          name: 'adminConfig',
          data: { action: 'bindOpenid', password: this._pwd }
        }).then((r) => {
          const result = (r && r.result) || {}
          if (result.code === 0) {
            wx.showToast({ title: '已加入白名单', icon: 'success' })
            this.ping()
            return
          }
          wx.showModal({ title: '操作失败', content: result.msg || '未知错误', showCancel: false })
        })
      }
    })
  },

  onCopyOpenid() {
    if (!this.data.openid) return
    wx.setClipboardData({
      data: this.data.openid,
      success: () => wx.showToast({ title: '已复制 openid', icon: 'none' })
    })
  }
})
