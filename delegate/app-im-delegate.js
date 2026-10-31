import {getIMHandlerFactory} from "../libs/im-sdk/im-factory";

export default class AppIMDelegate {
    constructor(app) {
        this._app = app;
        this._initialized = false;
    }

    onLaunch(options) {
        this.iIMHandler = getIMHandlerFactory;
        console.log('AppIMDelegate初始化');
    }

    onShow(options) {
        console.log('App onShow被触发');
        // 检查用户是否登录
        const userInfo = wx.getStorageSync('user_info');
        const userSigData = wx.getStorageSync('user_sig');

        console.log('用户信息检查:', {
            hasUserInfo: !!userInfo,
            hasUserSig: !!userSigData,
            initialized: this._initialized,
            userID: userInfo ? userInfo.userID : 'null'
        });

        if (userInfo && userSigData && !this._initialized) {
            // 用户已登录且未初始化，创建TIM连接
            console.log('用户已登录，创建TIM连接', userInfo.userID);
            this._initialized = true;

            try {
                this.iIMHandler.createConnection({options: {}});
            } catch (e) {
                console.error('创建TIM连接失败', e);
                this._initialized = false;
            }
        } else if (!userInfo || !userSigData) {
            console.log('用户未登录，跳过TIM连接');
            this._initialized = false;
        } else {
            console.log('TIM已初始化，跳过重复创建');
        }
    }

    onHide() {
        // 可以在这里做一些清理工作
    }

    getIMHandlerDelegate() {
        return this.iIMHandler;
    }

    resetInitialized() {
        this._initialized = false;
    }
}
