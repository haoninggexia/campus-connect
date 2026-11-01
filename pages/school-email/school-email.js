// pages/school-email/school-email.js
// 学校专属邮箱收集页：从 closed 页面携带 school 参数进入，登记邮箱时一并记录学校。
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

Page({
  data: {
    school: '',
    email: '',
    emailSubscribing: false,
    emailSubscribed: false,
    emailTip: ''
  },

  onLoad(options) {
    const school = (options && options.school) ? decodeURIComponent(options.school) : ''
    this.setData({ school })
    if (school) {
      wx.setNavigationBarTitle({ title: school })
    }
  },

  onShow() {
    this.checkEmailSubscribed()
  },

  onEmailInput(e) {
    this.setData({ email: e.detail.value, emailTip: '' })
  },

  async checkEmailSubscribed() {
    if (this.data.emailSubscribed) return
    if (wx.getStorageSync('emailSubscribed')) {
      this.setData({ emailSubscribed: true })
      return
    }
    try {
      const res = await wx.cloud.callFunction({
        name: 'subscribeEmail',
        data: { action: 'check' }
      })
      if (res && res.result && res.result.code === 0 && res.result.subscribed) {
        wx.setStorageSync('emailSubscribed', true)
        this.setData({ emailSubscribed: true })
      }
    } catch (e) {
      // 静默失败，不影响主流程
    }
  },

  async onSubscribeEmail() {
    if (this.data.emailSubscribing || this.data.emailSubscribed) return
    const email = (this.data.email || '').trim()
    if (!EMAIL_RE.test(email)) {
      this.setData({ emailTip: '请输入有效的邮箱地址' })
      return
    }

    this.setData({ emailSubscribing: true, emailTip: '' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'subscribeEmail',
        data: { action: 'subscribe', email, school: this.data.school }
      })
      const result = res && res.result
      if (result && result.code === 0) {
        wx.setStorageSync('emailSubscribed', true)
        this.setData({ emailSubscribed: true })
      } else {
        this.setData({ emailTip: (result && result.msg) || '提交失败，请稍后再试' })
      }
    } catch (e) {
      console.warn('邮箱登记失败:', e)
      this.setData({ emailTip: '网络异常，请稍后再试' })
    } finally {
      this.setData({ emailSubscribing: false })
    }
  },

  onBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/closed/closed' })
      }
    })
  }
})
