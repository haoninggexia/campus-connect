//app.js
import AppIMDelegate from "./delegate/app-im-delegate";

App({
    globalData: {
        userInfo: {},
        cloudEnv: 'cloud1-5gxeqv258148f9d9', // ⚠️ 请替换为你的云开发环境ID
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

        // 获取用户位置（首次登录时获取）
        this.getUserLocation();

        // 初始化IM委托
        this.appIMDelegate = new AppIMDelegate(this);
        this.appIMDelegate.onLaunch(options);
    },

    // 获取用户位置
    getUserLocation() {
        const locationRequested = wx.getStorageSync('location_permission_requested');

        if (locationRequested) {
            // 已经请求过位置权限，尝试静默获取
            wx.getLocation({
                type: 'gcj02',
                altitude: false,
                success: (res) => {
                    const location = {
                        latitude: res.latitude,
                        longitude: res.longitude
                    };
                    this.globalData.userLocation = location;
                    console.log('静默获取位置成功:', location);
                },
                fail: (err) => {
                    console.log('静默获取位置失败（可能用户之前拒绝了权限）:', err);
                    // 静默失败，不进行任何提示
                }
            });
        } else {
            // 首次请求位置权限
            wx.getLocation({
                type: 'gcj02',
                altitude: false,
                success: (res) => {
                    const location = {
                        latitude: res.latitude,
                        longitude: res.longitude
                    };
                    this.globalData.userLocation = location;
                    wx.setStorageSync('location_permission_requested', true);
                    console.log('首次获取位置成功:', location);
                },
                fail: (err) => {
                    console.log('获取位置失败:', err);
                    // 无论成功还是失败，都标记为已请求，避免重复提示
                    wx.setStorageSync('location_permission_requested', true);
                }
            });
        }
    },
    onHide() {
        this.appIMDelegate.onHide();
    },
    onShow(options) {
        this.appIMDelegate.onShow(options);
    }
});