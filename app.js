//app.js
import AppIMDelegate from "./delegate/app-im-delegate";

App({
    globalData: {
        userInfo: {},
        cloudEnv: 'cloud1-d3gh3da2m2b1bafeb', // ⚠️ 请替换为你的云开发环境ID
        db: null,
        cloud: null,
        userLocation: null, // 用户位置信息
        tabBar: {
            list: [
                { pagePath: 'pages/chat-list/chat-list', text: '首页' },
                { pagePath: 'pages/my-profile/my-profile', text: '我的' }
            ]
        }
    },
    getIMHandler() {
        return this.appIMDelegate.getIMHandlerDelegate();
    },
    onLaunch(options) {
        // 初始化云开发
        if (!wx.cloud) {
            console.error('请使用 2.2.3 或以上的基础库以使用云能力');
        } else {
            wx.cloud.init({
                env: this.globalData.cloudEnv,
                traceUser: true,
            });
            this.globalData.cloud = wx.cloud;
            this.globalData.db = wx.cloud.database();
            console.log('云开发初始化成功，环境ID:', this.globalData.cloudEnv);
        }

        // 启动在线状态心跳上报
        this.startHeartbeat();

        // 获取用户位置（首次登录时获取）
        this.getUserLocation();

        // 初始化IM委托
        this.appIMDelegate = new AppIMDelegate(this);
        this.appIMDelegate.onLaunch(options);
    },

    // 获取用户位置（模糊定位，精度为公里级，无需授权弹窗）
    getUserLocation() {
        wx.getFuzzyLocation({
            type: 'gcj02',
            success: (res) => {
                const location = {
                    latitude: res.latitude,
                    longitude: res.longitude
                };
                this.globalData.userLocation = location;
                console.log('获取模糊位置成功:', location);
            },
            fail: (err) => {
                console.log('获取模糊位置失败（请确认已申请 getFuzzyLocation 接口权限）:', err);
            }
        });
    },
    onHide() {
        this.appIMDelegate.onHide();
        this.stopHeartbeat();
    },
    onShow(options) {
        this.appIMDelegate.onShow(options);
        // 回到前台时恢复在线心跳
        this.startHeartbeat();
    },

    // 在线状态心跳：定期上报用户在线
    startHeartbeat() {
        if (this._heartbeatTimer) return;

        const sendHeartbeat = () => {
            const userInfo = wx.getStorageSync('user_info') || {};
            wx.cloud.callFunction({
                name: 'updateOnlineStatus',
                data: {
                    userID: userInfo.userID || '',
                    nickName: userInfo.nickName || '',
                    avatarUrl: userInfo.avatarUrl || ''
                }
            }).catch(err => {
                console.warn('在线心跳上报失败:', err);
            });
        };

        sendHeartbeat();
        this._heartbeatTimer = setInterval(sendHeartbeat, 20000); // 每20秒上报一次
    },

    // 停止在线状态心跳
    stopHeartbeat() {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }
});