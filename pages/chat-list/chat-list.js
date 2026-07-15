// pages/chat-list/chat-list.js

/**
 * 会话列表页面（整合在线聊天室功能）
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
        myAvatar: '',
        // 在线聊天室相关
        universities: ['北京大学', '清华大学', '复旦大学', '上海交通大学', '浙江大学', '南京大学', '中山大学', '武汉大学'],
        currentUniversity: '',
        rooms: [],
        userInfo: {},
        loading: false,
        pollingTimer: null,
        isPollingLoading: false // 防止并发加载
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
        let userInfo = wx.getStorageSync('user_info') || {};
        
        // 从 users_profile 获取性别信息
        try {
            const db = wx.cloud.database();
            if (db && userInfo.userID) {
                const profileRes = await db.collection('users_profile')
                    .where({ _openid: '{openid}' })
                    .get();
                if (profileRes.data && profileRes.data.length > 0) {
                    const profile = profileRes.data[0];
                    userInfo.gender = profile.gender || '';
                    userInfo.university = profile.university || userInfo.university || '';
                    // 更新本地缓存
                    wx.setStorageSync('user_info', userInfo);
                }
            }
            // 备用：调用云函数获取用户资料
            if (!userInfo.gender) {
                try {
                    const profileRes = await wx.cloud.callFunction({
                        name: 'getUserProfile',
                        data: {}
                    });
                    if (profileRes.result && profileRes.result.code === 0) {
                        const profile = profileRes.result.data;
                        userInfo.gender = profile.gender || '';
                        userInfo.university = profile.university || userInfo.university || '';
                        wx.setStorageSync('user_info', userInfo);
                    }
                } catch (e) {
                    console.warn('通过云函数获取用户资料失败:', e);
                }
            }
        } catch (e) {
            console.warn('获取用户性别失败:', e);
        }
        
        this.setData({
            myUserID: userInfo.userID || '',
            myNickName: userInfo.nickName || '用户',
            myAvatar: userInfo.avatarUrl || '/image/other_head.jpg',
            userInfo,
            currentUniversity: userInfo.university || this.data.universities[0]
        });

        // 开始轮询房间列表
        this.startPolling();

        // 只有已登录用户才加载TIM会话
        if (!userInfo.userID) {
            return;
        }

        // 等待一小段时间，确保TIM已初始化
        await this.waitForTIMReady();

        // 加载TIM会话
        this.loadConversations();
    },

    /**
     * 生命周期函数--监听页面隐藏
     */
    onHide() {
        // 停止轮询
        this.stopPolling();
    },

    // ==================== 在线聊天室功能 ====================

    // 检查登录状态，如果未登录则跳转到登录页
    checkLogin() {
        const userInfo = wx.getStorageSync('user_info') || {};
        if (!userInfo.userID) {
            wx.navigateTo({
                url: '/pages/auth/auth'
            });
            return false;
        }
        return true;
    },

    // 开始轮询
    startPolling() {
        // 先停止之前的轮询，避免重复创建定时器
        this.stopPolling();
        this._pollingFailCount = 0; // 重置失败计数
        this.loadRooms();
        const timer = setInterval(() => {
            this.loadRooms();
        }, 3000); // 每3秒刷新一次
        this.data.pollingTimer = timer;
    },

    // 停止轮询
    stopPolling() {
        if (this.data.pollingTimer) {
            clearInterval(this.data.pollingTimer);
            this.data.pollingTimer = null;
        }
    },

    // 切换大学
    onSwitchUniversity(e) {
        const university = e.currentTarget.dataset.university;
        this.setData({ currentUniversity: university });
        this.loadRooms();
    },

    // 加载房间列表
    async loadRooms() {
        // 防止并发调用
        if (this.data.isPollingLoading) return;

        // 检查云开发是否就绪
        if (!wx.cloud) {
            console.warn('云开发未初始化，跳过房间加载');
            return;
        }

        this.setData({ isPollingLoading: true });

        try {
            const res = await wx.cloud.callFunction({
                name: 'getAvailableRooms',
                data: {
                    university: this.data.currentUniversity
                }
            });

            if (res.result && res.result.code === 0) {
                // 预处理房间数据，添加性别相关的样式类和符号
                const processedRooms = (res.result.data || []).map(room => {
                    const gender = room.user1 && room.user1.gender;
                    return {
                        ...room,
                        genderClass: gender === '男' ? 'room-item-male' : (gender === '女' ? 'room-item-female' : ''),
                        genderSymbol: gender === '男' ? '♂' : (gender === '女' ? '♀' : '')
                    };
                });
                this.setData({ rooms: processedRooms });
                this._pollingFailCount = 0; // 成功时重置失败计数
            }
        } catch (e) {
            this._pollingFailCount = (this._pollingFailCount || 0) + 1;
            console.error('加载房间列表失败', e);
            // 连续失败5次后停止轮询
            if (this._pollingFailCount >= 5) {
                console.warn('房间列表连续加载失败5次，停止轮询');
                this.stopPolling();
            }
        } finally {
            this.setData({ isPollingLoading: false });
        }
    },

    // 创建新房间
    async onCreateRoom() {
        if (!this.checkLogin()) return;
        
        // 检查性别是否已设置
        if (!this.data.userInfo.gender) {
            wx.showToast({
                title: '请先在个人中心设置性别',
                icon: 'none',
                duration: 2000
            });
            return;
        }

        wx.showLoading({ title: '创建中...' });
        
        try {
            const res = await wx.cloud.callFunction({
                name: 'enterRoom',
                data: {
                    university: this.data.currentUniversity,
                    userInfo: this.data.userInfo
                }
            });

            wx.hideLoading();
            
            if (res.result.code === 0) {
                const roomData = res.result.data;
                wx.navigateTo({
                    url: `/pages/chat-room/chat-room?roomId=${roomData.roomId}&university=${this.data.currentUniversity}&isCreator=true`
                });
            } else {
                wx.showToast({
                    title: res.result.msg || '创建失败',
                    icon: 'none'
                });
            }
        } catch (e) {
            wx.hideLoading();
            console.error('创建房间失败', e);
            wx.showToast({
                title: '创建失败',
                icon: 'none'
            });
        }
    },

    // 进入房间
    async onEnterRoom(e) {
        if (!this.checkLogin()) return;
        
        // 检查性别是否已设置
        if (!this.data.userInfo.gender) {
            wx.showToast({
                title: '请先在个人中心设置性别',
                icon: 'none',
                duration: 2000
            });
            return;
        }

        const roomId = e.currentTarget.dataset.roomid;
        const room = this.data.rooms.find(r => r._id === roomId);
        
        if (!room) return;
        
        // 如果房间已满，不能进入
        if (room.status === 2) {
            wx.showToast({
                title: '房间已满，请选择其他房间',
                icon: 'none'
            });
            return;
        }
        
        wx.showLoading({ title: '进入中...' });
        
        try {
            console.log('调用enterRoom云函数，参数:', { roomId, university: this.data.currentUniversity, userInfo: this.data.userInfo });
            
            const res = await wx.cloud.callFunction({
                name: 'enterRoom',
                data: {
                    roomId,
                    university: this.data.currentUniversity,
                    userInfo: this.data.userInfo
                }
            });

            wx.hideLoading();
            
            console.log('enterRoom云函数返回:', res);
            
            if (res.result.code === 0) {
                console.log('进入房间成功，跳转到聊天页面');
                wx.navigateTo({
                    url: `/pages/chat-room/chat-room?roomId=${roomId}&university=${this.data.currentUniversity}&isCreator=false`
                });
            } else {
                console.error('进入房间失败:', res.result.msg);
                wx.showToast({
                    title: res.result.msg || '进入失败',
                    icon: 'none',
                    duration: 3000
                });
            }
        } catch (e) {
            wx.hideLoading();
            console.error('进入房间异常:', e);
            wx.showToast({
                title: '进入失败: ' + (e.errMsg || '未知错误'),
                icon: 'none',
                duration: 3000
            });
        }
    },

    // 获取房间状态文字
    getStatusText(status) {
        switch(status) {
            case 0: return '空闲';
            case 1: return '等待中 (1/2)';
            case 2: return '聊天中 (2/2)';
            default: return '未知';
        }
    },

    // 获取房间状态颜色
    getStatusColor(status) {
        switch(status) {
            case 0: return '#999';
            case 1: return '#07c160';
            case 2: return '#ff5252';
            default: return '#999';
        }
    },

    // ==================== TIM 会话功能 ====================

    // 加载TIM会话列表
    async loadConversations() {
        try {
            const imHandler = getApp().getIMHandler();
            if (!imHandler) {
                console.warn('IM handler 未初始化，跳过会话加载');
                return;
            }

            imHandler.setOnReceiveMessageListener({
                listener: (msg) => {
                    console.log('会话列表', msg);
                    if (msg.type === 'get-conversations' && Array.isArray(msg.conversations)) {
                        this.setData({ conversations: msg.conversations.map(item => this.getConversationsItem(item)) });
                    }
                }
            });

            const conversations = await imHandler.getConversationList();
            console.log('获取会话列表成功', conversations);

            if (Array.isArray(conversations)) {
                const list = conversations.map(conv => this.getConversationsItem(conv));
                this.setData({ conversations: list });
            }
        } catch (e) {
            console.log('获取会话列表失败', e);
        }
    },

    // 等待TIM初始化
    waitForTIMReady() {
        return new Promise((resolve) => {
            let count = 0;
            const maxCount = 60; // 最多等待6秒（覆盖网络波动场景）

            const check = () => {
                if (count >= maxCount) {
                    console.log('等待TIM初始化超时，SDK可能无法连接（请检查socket合法域名是否配置了 wss://wss.im.qcloud.com）');
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
