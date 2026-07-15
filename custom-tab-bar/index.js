Component({
  data: {
    selected: 0,
    list: [
      { pagePath: 'pages/chat-list/chat-list', text: '首页' },
      { pagePath: 'pages/my-profile/my-profile', text: '我的' }
    ]
  },

  methods: {
    switchTab(e) {
      const { path, index } = e.currentTarget.dataset;
      if (this.data.selected === index) return;

      wx.switchTab({
        url: `/${path}`
      });
    }
  }
});
