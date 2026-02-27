// pages/chat-list/chat-list.js

/**
 * 会话列表页面
 */
Page({

    /**
     * 页面的初始数据
     */
    data: {
        conversations: [],
        // 当前用户信息
        myUserID: '',
        myNickName: '',
        myAvatar: ''
    },

    /**
     * 生命周期函数--监听页面加载
     */
    onLoad(options) {

    },

    toChat(e) {
        let item = e.currentTarget.dataset.item;
        delete item.latestMsg;
        delete item.unread;
        delete item.content;

        // 跳转到使用TIM SDK的聊天页面
        wx.navigateTo({
            url: `../chat-tim/chat-tim?friend=${encodeURIComponent(JSON.stringify(item))}`
        });
    },

    /**
     * 跳转到在线聊天室
     */
    onToOnlineChat() {
        wx.navigateTo({
            url: '/pages/rooms-list/rooms-list'
        });
    },

    /**
     * 跳转到个人中心
     */
    onToMyProfile() {
        wx.navigateTo({
            url: '/pages/my-profile/my-profile'
        });
    },
    /**
     * 生命周期函数--监听页面显示
     */
    async onShow() {
        // 加载当前用户信息
        const userInfo = wx.getStorageSync('user_info') || {};
        this.setData({
            myUserID: userInfo.userID || '',
            myNickName: userInfo.nickName || '用户',
            myAvatar: userInfo.avatarUrl || '/image/other_head.jpg'
        });

        // 等待一小段时间，确保TIM已初始化
        await this.waitForTIMReady();

        getApp().getIMHandler().setOnReceiveMessageListener({
            listener: (msg) => {
                console.log('会话列表', msg);
                msg.type === 'get-conversations' && this.setData({conversations: msg.conversations.map(item => this.getConversationsItem(item))})
            }
        });

        try {
            const conversations = await getApp().getIMHandler().getConversationList();
            console.log('获取会话列表成功', conversations);

            const list = conversations.map(conv => this.getConversationsItem(conv));
            this.setData({conversations: list});
        } catch (e) {
            console.log('获取会话列表失败', e);
            wx.showToast({ title: '获取会话列表失败', icon: 'none' });
        }
    },

    // 等待TIM初始化
    waitForTIMReady() {
        return new Promise((resolve) => {
            let count = 0;
            const maxCount = 20; // 最多等待2秒

            const check = () => {
                if (count >= maxCount) {
                    console.log('等待TIM初始化超时');
                    resolve();
                    return;
                }

                try {
                    const handler = getApp().getIMHandler();
                    if (handler && handler._isLogin) {
                        console.log('TIM已就绪');
                        resolve();
                        return;
                    }
                } catch (e) {
                    // 忽略错误，继续等待
                }

                count++;
                setTimeout(check, 100);
            };

            check();
        });
    },
    getConversationsItem(item) {
        try {
            let {latestMsg, ...msg} = item;
            if (latestMsg) {
                const parsedContent = typeof latestMsg === 'string' ? JSON.parse(latestMsg) : latestMsg;
                return Object.assign(msg, parsedContent);
            }
            return msg;
        } catch (e) {
            console.error('解析latestMsg失败:', e);
            return item;
        }
    }
});
