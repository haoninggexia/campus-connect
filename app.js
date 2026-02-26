//app.js
import AppIMDelegate from "./delegate/app-im-delegate";

App({
    globalData: {
        userInfo: {},
        cloudEnv: 'cloud1-9g55gy2x541c7f64', // ⚠️ 请替换为你的云开发环境ID
        db: null,
        cloud: null
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

        // 初始化IM委托
        this.appIMDelegate = new AppIMDelegate(this);
        this.appIMDelegate.onLaunch(options);
    },
    onHide() {
        this.appIMDelegate.onHide();
    },
    onShow(options) {
        this.appIMDelegate.onShow(options);
    }
});