Page({
  data: {
    universities: [
      '北京大学', '清华大学', '复旦大学', '上海交通大学',
      '浙江大学', '南京大学', '武汉大学', '华中科技大学',
      '中山大学', '西安交通大学', '哈尔滨工业大学',
      '中国人民大学', '北京师范大学', '同济大学', '南开大学',
      '厦门大学', '天津大学', '东南大学', '四川大学'
    ],
    university: '',
    major: ''
  },

  onLoad(options) {
    // 检查是否已登录
    const userInfo = wx.getStorageSync('user_info')
    if (userInfo && userInfo.userID) {
      // 已登录，直接跳转到首页
      wx.switchTab({
        url: '/pages/chat-list/chat-list'
      })
    }
  },

  onUniversityChange(e) {
    this.setData({
      university: this.data.universities[e.detail.value]
    })
  },

  onMajorInput(e) {
    this.setData({
      major: e.detail.value
    })
  },

  async onLogin(e) {
    // 1. 表单验证
    if (!this.data.university) {
      wx.showToast({ title: '请选择大学', icon: 'none' })
      return
    }

    if (!this.data.major.trim()) {
      wx.showToast({ title: '请填写专业', icon: 'none' })
      return
    }

    // 2. 获取微信用户信息
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
            university: this.data.university,
            major: this.data.major,
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
            university: this.data.university,
            major: this.data.major,
            createTime: new Date()
          }
        })

        console.log('创建用户成功', userID)
      }

      // 6. 缓存用户信息
      const userCache = {
        userID,
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
        university: this.data.university,
        major: this.data.major
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

          // 9. 跳转到首页
          setTimeout(() => {
            wx.switchTab({
              url: '/pages/chat-list/chat-list'
            })
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
