const DEFAULT_AVATAR = '/image/my_head.jpeg'
const DEFAULT_NICKNAME = '可爱的小朋友'
const PHONE_RE = /^1[3-9]\d{9}$/

Page({
  data: {
    agreed: false,
    phone: '',
    smsCode: '',
    countdown: 0,
    sending: false,
    logging: false,
    canSendCode: false,
    canLogin: false,
    codeSent: false,
    maskedPhone: '',
    devCode: ''
  },

  _countdownTimer: null,

  onLoad() {
    // 检查是否已登录
    const userInfo = wx.getStorageSync('user_info')
    if (userInfo && userInfo.userID) {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
      } else {
        wx.switchTab({ url: '/pages/chat-list/chat-list' })
      }
    }
  },

  onUnload() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer)
      this._countdownTimer = null
    }
  },

  _refreshBtnState() {
    const { phone, smsCode, countdown, sending, logging, agreed } = this.data
    this.setData({
      canSendCode: phone.length === 11 && countdown === 0 && !sending,
      canLogin: agreed && PHONE_RE.test(phone) && smsCode.length === 6 && !logging
    })
  },

  onPhoneInput(e) {
    const phone = (e.detail.value || '').replace(/\D/g, '').slice(0, 11)
    this.setData({ phone }, () => this._refreshBtnState())
  },

  onCodeInput(e) {
    const smsCode = (e.detail.value || '').replace(/\D/g, '').slice(0, 6)
    this.setData({ smsCode }, () => this._refreshBtnState())
  },

  toggleAgreement() {
    this.setData({ agreed: !this.data.agreed }, () => this._refreshBtnState())
  },

  goUserAgreement(e) {
    if (e && e.stopPropagation) e.stopPropagation()
    wx.navigateTo({ url: '/pages/user-agreement/user-agreement' })
  },

  goPrivacyPolicy(e) {
    if (e && e.stopPropagation) e.stopPropagation()
    wx.navigateTo({ url: '/pages/privacy-policy/privacy-policy' })
  },

  // 获取短信验证码
  async onSendCode() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意协议', icon: 'none' })
      return
    }
    if (!PHONE_RE.test(this.data.phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }
    if (!this.data.canSendCode) return

    this.setData({ sending: true }, () => this._refreshBtnState())
    wx.showLoading({ title: '发送中...', mask: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'sendSmsCode',
        data: { phone: this.data.phone, agreed: true }
      })
      wx.hideLoading()

      if (!result || result.code !== 0) {
        wx.showToast({ title: (result && result.message) || '发送失败', icon: 'none' })
        return
      }

      wx.showToast({ title: '验证码已发送', icon: 'success' })
      this.setData({
        codeSent: true,
        maskedPhone: result.maskedPhone || '',
        devCode: result.devCode || ''
      })
      this._startCountdown(60)
    } catch (err) {
      wx.hideLoading()
      console.error('发送验证码失败', err)
      wx.showToast({ title: '发送失败，请确认云函数已部署', icon: 'none' })
    } finally {
      this.setData({ sending: false }, () => this._refreshBtnState())
    }
  },

  _startCountdown(seconds) {
    if (this._countdownTimer) clearInterval(this._countdownTimer)
    this.setData({ countdown: seconds }, () => this._refreshBtnState())
    this._countdownTimer = setInterval(() => {
      const next = this.data.countdown - 1
      if (next <= 0) {
        clearInterval(this._countdownTimer)
        this._countdownTimer = null
        this.setData({ countdown: 0 }, () => this._refreshBtnState())
      } else {
        this.setData({ countdown: next })
      }
    }, 1000)
  },

  // 校验验证码并登录 / 注册
  async onLogin() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意协议', icon: 'none' })
      return
    }
    if (!PHONE_RE.test(this.data.phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }
    if (this.data.smsCode.length !== 6) {
      wx.showToast({ title: '请输入 6 位验证码', icon: 'none' })
      return
    }
    if (!this.data.canLogin) return

    this.setData({ logging: true }, () => this._refreshBtnState())
    wx.showLoading({ title: '登录中...', mask: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'phoneLogin',
        data: {
          phone: this.data.phone,
          code: this.data.smsCode,
          agreed: true
        }
      })

      if (!result || result.code !== 0) {
        wx.hideLoading()
        wx.showToast({ title: (result && result.message) || '登录失败', icon: 'none' })
        return
      }

      const u = result.data

      const sigRes = await wx.cloud.callFunction({
        name: 'getUserSig',
        data: { userID: u.userID }
      })
      if (!sigRes.result || sigRes.result.code !== 0) {
        throw new Error((sigRes.result && sigRes.result.message) || '获取 UserSig 失败')
      }
      wx.setStorageSync('user_sig', sigRes.result.data)

      // UserSig 成功后再写入登录态，避免出现「有 user_info 但无 user_sig」的半登录状态
      // 缓存结构与原微信登录保持一致，下游聊天/资料/心跳逻辑无需改动
      wx.setStorageSync('user_info', {
        userID: u.userID,
        nickName: u.nickName || DEFAULT_NICKNAME,
        avatarUrl: u.avatarUrl || DEFAULT_AVATAR,
        maskedPhone: u.maskedPhone || ''
      })

      wx.hideLoading()
      wx.showToast({ title: '登录成功', icon: 'success' })

      getApp().appIMDelegate.resetInitialized()
      setTimeout(() => {
        try {
          getApp().getIMHandler().createConnection({ options: {} })
        } catch (e) {
          console.error('创建TIM连接失败', e)
          wx.showToast({ title: 'IM连接失败', icon: 'none' })
        }

        setTimeout(() => {
          const pages = getCurrentPages()
          if (pages.length > 1) {
            wx.navigateBack()
          } else {
            wx.switchTab({ url: '/pages/chat-list/chat-list' })
          }
        }, 1000)
      }, 500)
    } catch (err) {
      wx.hideLoading()
      console.error('登录失败', err)
      wx.showToast({ title: err.message || '登录失败，请重试', icon: 'none' })
    } finally {
      this.setData({ logging: false }, () => this._refreshBtnState())
    }
  }
})
