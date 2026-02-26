// pages/friends-tim/friends-tim.js
Page({
  data: {
    currentTab: 0, // 0: 我的好友, 1: 所有用户
    searchKeyword: '',
    friends: [],
    allUsers: [],
    myUserID: '',
    loading: false
  },

  onLoad() {
    // 获取当前用户ID
    const userInfo = wx.getStorageSync('user_info') || {};
    this.setData({
      myUserID: userInfo.userID || ''
    });
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadData();
  },

  /**
   * 加载数据
   */
  async loadData() {
    const tab = this.data.currentTab;

    if (tab === 0) {
      // 加载好友列表
      await this.loadFriendsList();
    } else {
      // 加载所有用户
      await this.loadAllUsers();
    }
  },

  /**
   * 加载好友列表
   */
  async loadFriendsList() {
    try {
      // 使用云函数获取好友列表
      const { result } = await wx.cloud.callFunction({
        name: 'friendOperation',
        data: {
          action: 'getFriends',
          myUserID: this.data.myUserID
        }
      });

      if (result.code !== 0) {
        console.error('加载好友列表失败', result.message);
        return;
      }

      const friends = result.data;
      console.log('好友列表:', friends);

      // 格式化好友数据
      const friendList = friends.map(friend => ({
        userID: friend.friendUserID,
        nick: friend.friendNickName,
        avatar: friend.friendAvatar,
        online: friend.online || false
      }));

      this.setData({
        friends: friendList
      });

    } catch (e) {
      console.error('加载好友列表失败', e);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  /**
   * 加载所有用户
   */
  async loadAllUsers() {
    try {
      this.setData({ loading: true });

      const db = getApp().globalData.db;

      if (!db) {
        console.error('数据库未初始化');
        return;
      }

      // 获取所有用户（排除自己）
      const { data: users } = await db.collection('users')
        .get();

      console.log('用户列表:', users);

      // 过滤掉自己，并标记是否是好友
      const friendUserIDs = this.data.friends.map(f => f.userID);

      let allUsers = users
        .filter(user => user.userID !== this.data.myUserID)
        .map(user => ({
          ...user,
          isFriend: friendUserIDs.includes(user.userID)
        }));

      // 如果有搜索关键词，过滤用户列表
      if (this.data.searchKeyword && this.data.searchKeyword.trim()) {
        const keyword = this.data.searchKeyword.trim().toLowerCase();
        allUsers = allUsers.filter(user =>
          user.userID.toLowerCase().includes(keyword) ||
          user.nickName.toLowerCase().includes(keyword)
        );
      }

      this.setData({
        allUsers: allUsers,
        loading: false
      });

    } catch (e) {
      console.error('加载用户列表失败', e);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  /**
   * 切换Tab
   */
  switchTab(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      currentTab: index
    });
    this.loadData();
  },

  /**
   * 搜索输入
   */
  async onSearchInput(e) {
    const keyword = e.detail.value;
    this.setData({
      searchKeyword: keyword
    });

    // 如果在"所有用户"标签页，实时过滤列表
    if (this.data.currentTab === 1) {
      await this.loadAllUsers();
    }
  },

  /**
   * 清空搜索
   */
  async onClearSearch() {
    this.setData({
      searchKeyword: ''
    });

    if (this.data.currentTab === 1) {
      await this.loadAllUsers();
    }
  },

  async onSearch() {
    const keyword = this.data.searchKeyword.trim();

    // 如果没有输入，清空搜索并加载所有用户
    if (!keyword) {
      this.setData({ searchKeyword: '' });
      await this.loadAllUsers();
      wx.showToast({
        title: '已显示所有用户',
        icon: 'success'
      });
      return;
    }

    try {
      wx.showLoading({ title: '搜索中...' });

      const db = getApp().globalData.db;

      if (!db) {
        console.error('数据库未初始化');
        wx.hideLoading();
        return;
      }

      // 通过用户ID或昵称搜索用户（模糊匹配）
      const { data: users } = await db.collection('users')
        .get();

      console.log('搜索结果:', users);

      wx.hideLoading();

      // 切换到"所有用户"标签页
      this.setData({
        currentTab: 1
      });

      // 标记是否是好友
      const friendUserIDs = this.data.friends.map(f => f.userID);

      // 过滤并匹配用户
      const keywordLower = keyword.toLowerCase();
      const searchResults = users
        .filter(user => user.userID !== this.data.myUserID)
        .filter(user =>
          user.userID.toLowerCase().includes(keywordLower) ||
          user.nickName.toLowerCase().includes(keywordLower)
        )
        .map(user => ({
          ...user,
          isFriend: friendUserIDs.includes(user.userID)
        }));

      if (searchResults.length === 0) {
        wx.showModal({
          title: '未找到用户',
          content: '没有找到匹配的用户，请检查ID或昵称是否正确',
          showCancel: false
        });
        return;
      }

      this.setData({
        allUsers: searchResults
      });

      wx.showToast({
        title: `找到 ${searchResults.length} 个用户`,
        icon: 'success'
      });

    } catch (e) {
      console.error('搜索失败', e);
      wx.hideLoading();
      wx.showToast({
        title: '搜索失败',
        icon: 'none'
      });
    }
  },

  /**
   * 点击好友
   */
  onFriendClick(e) {
    const friend = e.currentTarget.dataset.friend;
    console.log('点击好友', friend);

    // 可以查看好友详情
    wx.showModal({
      title: friend.nick,
      content: `用户ID: ${friend.userID}\n状态: ${friend.online ? '在线' : '离线'}`,
      showCancel: true,
      confirmText: '去聊天',
      success: (res) => {
        if (res.confirm) {
          this.onChat({ currentTarget: { dataset: { friend } } });
        }
      }
    });
  },

  /**
   * 点击用户
   */
  onUserClick(e) {
    const user = e.currentTarget.dataset.user;
    console.log('点击用户', user);

    wx.showModal({
      title: user.nickName,
      content: `用户ID: ${user.userID}\n大学: ${user.university}\n专业: ${user.major}`,
      showCancel: true,
      confirmText: '添加好友',
      success: (res) => {
        if (res.confirm && !user.isFriend) {
          this.onAddFriend({ currentTarget: { dataset: { user } } });
        }
      }
    });
  },

  /**
   * 聊天
   */
  onChat(e) {
    const friend = e.currentTarget.dataset.friend;

    wx.navigateTo({
      url: `../chat-tim/chat-tim?friend=${encodeURIComponent(JSON.stringify({
        friendId: friend.userID,
        friendName: friend.nick,
        friendHeadUrl: friend.avatar
      }))}`
    });
  },

  /**
   * 添加好友
   */
  async onAddFriend(e) {
    const user = e.currentTarget.dataset.user;

    if (user.isFriend) {
      wx.showToast({
        title: '已经是好友了',
        icon: 'none'
      });
      return;
    }

    const that = this;

    wx.showModal({
      title: '添加好友',
      content: `确定要添加 ${user.nickName} 为好友吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '添加中...' });

          try {
            // 使用云函数添加好友
            const { result } = await wx.cloud.callFunction({
              name: 'friendOperation',
              data: {
                action: 'add',
                myUserID: that.data.myUserID,
                friendUserID: user.userID,
                friendNickName: user.nickName,
                friendAvatar: user.avatarUrl
              }
            });

            wx.hideLoading();

            if (result.code === -2) {
              wx.showToast({
                title: '已经是好友了',
                icon: 'none'
              });
              return;
            }

            if (result.code !== 0) {
              console.error('添加好友失败', result.message);
              wx.showToast({
                title: result.message || '添加失败',
                icon: 'none'
              });
              return;
            }

            wx.showToast({
              title: '添加成功',
              icon: 'success'
            });

            // 刷新列表
            await that.loadData();

            // 更新用户列表中的好友状态
            const allUsers = that.data.allUsers.map(u => {
              if (u.userID === user.userID) {
                u.isFriend = true;
              }
              return u;
            });

            that.setData({ allUsers });

          } catch (e) {
            console.error('添加好友失败', e);
            wx.hideLoading();
            wx.showToast({
              title: '添加失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  /**
   * 删除好友
   */
  async onDeleteFriend(e) {
    const friend = e.currentTarget.dataset.friend;

    wx.showModal({
      title: '删除好友',
      content: `确定要删除好友 ${friend.nick} 吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });

          try {
            // 使用云函数删除好友
            const { result } = await wx.cloud.callFunction({
              name: 'friendOperation',
              data: {
                action: 'delete',
                myUserID: this.data.myUserID,
                friendUserID: friend.userID
              }
            });

            wx.hideLoading();

            if (result.code !== 0) {
              console.error('删除好友失败', result.message);
              wx.showToast({
                title: result.message || '删除失败',
                icon: 'none'
              });
              return;
            }

            wx.showToast({
              title: '删除成功',
              icon: 'success'
            });

            // 刷新列表
            await this.loadData();

          } catch (e) {
            console.error('删除好友失败', e);
            wx.hideLoading();
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  }
});
