Page({
  data: {
    agreed: false
  },

  onLoad(options) {
    // 检查是否已登录
    const userInfo = wx.getStorageSync('user_info')
    if (userInfo && userInfo.userID) {
      // 已登录：如果有上一页则返回，否则跳转到聊天室
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
      } else {
        wx.switchTab({
          url: '/pages/chat-list/chat-list'
        })
      }
    }
  },

  toggleAgreement() {
    this.setData({ agreed: !this.data.agreed })
  },

  goUserAgreement(e) {
    if (e && e.stopPropagation) e.stopPropagation()
    wx.navigateTo({ url: '/pages/user-agreement/user-agreement' })
  },

  goPrivacyPolicy(e) {
    if (e && e.stopPropagation) e.stopPropagation()
    wx.navigateTo({ url: '/pages/privacy-policy/privacy-policy' })
  },

  async onLogin(e) {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意协议', icon: 'none' })
      return
    }

    // 1. 获取微信用户信息
    const { userInfo } = e.detail
    if (!userInfo) {
      wx.showToast({ title: '请授权登录', icon: 'none' })
      return
    }

    wx.showLoading({ title: '登录中...' })

    try {
      // 3. 获取微信登录凭证
      const loginRes = await wx.login()

      // 4. 获取云开发数据库实例
      const db = getApp().globalData.db

      if (!db) {
        wx.hideLoading()
        wx.showToast({ title: '云开发未初始化', icon: 'none' })
        return
      }

      // 5. 检查用户是否已存在
      const { data: existingUsers } = await db.collection('users')
        .where({ _openid: '{openid}' })
        .get()

      let userID

      if (existingUsers && existingUsers.length > 0) {
        // 用户已存在，更新信息
        userID = existingUsers[0].userID

        await db.collection('users').doc(existingUsers[0]._id).update({
          data: {
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl,
            updateTime: new Date()
          }
        })

        console.log('更新用户信息成功', userID)
      } else {
        // 新用户，创建记录
        userID = `wx_${loginRes.code}_${Date.now()}`

        await db.collection('users').add({
          data: {
            userID,
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl,
            createTime: new Date()
          }
        })

        console.log('创建用户成功', userID)
      }

      // 6. 缓存用户信息
      const userCache = {
        userID,
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl
      }
      wx.setStorageSync('user_info', userCache)

      // 7. 调用云函数获取UserSig
      const { result } = await wx.cloud.callFunction({
        name: 'getUserSig',
        data: { userID }
      })

      if (result.code === 0) {
        wx.setStorageSync('user_sig', result.data)
        console.log('获取UserSig成功')
      } else {
        throw new Error(result.message)
      }

      wx.hideLoading()
      wx.showToast({ title: '登录成功', icon: 'success' })

      // 8. 直接触发创建TIM连接
      console.log('登录成功，准备创建TIM连接');
      getApp().appIMDelegate.resetInitialized();

      setTimeout(() => {
        try {
          const handler = getApp().getIMHandler();
          console.log('调用createConnection，handler:', handler);
          handler.createConnection({options: {}});

          // 9. 跳转：优先返回上一页，否则切换到聊天室
          setTimeout(() => {
            const pages = getCurrentPages()
            if (pages.length > 1) {
              wx.navigateBack()
            } else {
              wx.switchTab({
                url: '/pages/chat-list/chat-list'
              })
            }
          }, 1000);
        } catch (e) {
          console.error('创建TIM连接失败', e);
          wx.showToast({
            title: 'IM连接失败',
            icon: 'none'
          });
        }
      }, 500)

    } catch (err) {
      wx.hideLoading()
      console.error('登录失败', err)
      wx.showToast({
        title: err.message || '登录失败，请重试',
        icon: 'none'
      })
    }
  }
})
