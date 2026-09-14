import IIMHandler from "../interface/i-im-handler";
// 直接加载项目根目录的 TIM SDK 文件（不再依赖 miniprogram_npm / 构建 npm）
const TIM = require('../../../tim-wx.js');
console.log('TIM SDK版本:', TIM.VERSION || 'unknown');

/**
 * 腾讯云IM实现类
 * 使用云函数生成的UserSig进行安全登录
 */
export default class TIMHandlerImp extends IIMHandler {
    constructor() {
        super();
        this._isLogin = false;
        this._tim = null;
        this._receiveListener = null;
        this._loginPromise = null;
        this._initialized = false; // 添加初始化标志
    }

    /**
     * 初始化TIM并创建连接
     */
    createConnection({options}) {
        console.log('TIMHandlerImp.createConnection被调用');

        // 读取TIM配置
        const timConfig = require('../../../utils/tim-config.js').default;

        console.log('初始化TIM，SDKAppID:', timConfig.SDKAppID);

        // 初始化TIM实例
        this._tim = TIM.create({
            SDKAppID: timConfig.SDKAppID
        });

        console.log('TIM实例创建成功');

        // 设置日志级别（0：普通，1：release，2：warn，3：error，4：none）
        this._tim.setLogLevel(1);

        // 监听事件
        this._tim.on(TIM.EVENT.SDK_READY, this._onSDKReady.bind(this));
        this._tim.on(TIM.EVENT.MESSAGE_RECEIVED, this._onMessageReceived.bind(this));
        this._tim.on(TIM.EVENT.ERROR, this._onError.bind(this));
        this._tim.on(TIM.EVENT.KICKED_OUT, this._onKickedOut.bind(this));
        this._tim.on(TIM.EVENT.NET_STATE_CHANGE, this._onNetStateChange.bind(this));
        this._tim.on(TIM.EVENT.CONVERSATION_LIST_UPDATED, this._onConversationListUpdated.bind(this));

        console.log('TIM事件监听器已设置');

        // 登录TIM
        console.log('开始登录TIM...');
        this._login();
    }

    /**
     * 登录TIM
     */
    async _login() {
        if (this._loginPromise) {
            return this._loginPromise;
        }

        const userInfo = wx.getStorageSync('user_info');
        const userSigData = wx.getStorageSync('user_sig');

        if (!userInfo || !userSigData) {
            console.warn('未找到用户信息或UserSig，跳过TIM登录');
            return;
        }

        this._loginPromise = this._tim.login({
            userID: userInfo.userID,
            userSig: userSigData.userSig
        });

        try {
            await this._loginPromise;
            console.log('TIM登录成功', userInfo.userID);
        } catch (error) {
            console.error('TIM登录失败', error);
            this._loginPromise = null;

            // UserSig可能过期，引导用户重新登录
            if (error.code === 70001 || error.code === 70009) {
                wx.showToast({
                    title: '登录已过期，请重新登录',
                    icon: 'none',
                    duration: 2000
                });
                setTimeout(() => {
                    wx.reLaunch({ url: '/pages/auth/auth' });
                }, 2000);
            }
        }
    }

    /**
     * SDK准备就绪回调
     */
    _onSDKReady(event) {
        console.log('TIM SDK准备就绪');
        this._isLogin = true;
        this._initialized = true; // 设置初始化标志
    }

    /**
     * 收到消息回调
     */
    _onMessageReceived(event) {
        const messageList = event.data;

        messageList.forEach(message => {
            console.log('收到TIM消息', message);

            if (this._receiveListener) {
                // 转换TIM消息格式为项目格式
                const msg = this._convertTIMMessage(message);
                this._receiveListener(msg);
            }
        });
    }

    /**
     * 错误回调
     * 注意：网络连接错误（如WebSocket域名未配置）不应重置登录状态，
     * 只有真正致命的认证错误才需要标记未登录
     */
    _onError(event) {
        console.error('TIM错误', event);
        const errorCode = event.data && event.data.code;
        
        // 只有致命错误（如UserSig过期、被踢下线等）才重置登录状态
        // 网络连接错误（code 2800等）不重置_isLogin，等待SDK自动重连
        if (errorCode === 70001 || errorCode === 70009 || errorCode === 70013 || errorCode === 70014) {
            console.error('TIM致命错误，重置登录状态');
            this._isLogin = false;
        }
        // code 3000 (SDK not ready) 和网络错误不重置状态
    }

    /**
     * 被踢出回调
     */
    _onKickedOut(event) {
        console.warn('TIM被踢出', event);
        this._isLogin = false;

        wx.showToast({
            title: '账号在别处登录',
            icon: 'none',
            duration: 2000
        });
        setTimeout(() => {
            wx.reLaunch({ url: '/pages/auth/auth' });
        }, 2000);
    }

    /**
     * 网络状态变化回调
     */
    _onNetStateChange(event) {
        console.log('TIM网络状态变化', event);
    }

    /**
     * 会话列表更新回调
     */
    _onConversationListUpdated(event) {
        console.log('TIM会话列表更新', event);
        if (this._receiveListener) {
            this._receiveListener({
                type: 'get-conversations',
                conversations: this._convertConversations(event.data)
            });
        }
    }

    /**
     * 发送消息
     */
    sendMsg({content}) {
        return new Promise((resolve, reject) => {
            if (!this._tim) {
                reject(new Error('TIM未初始化'));
                return;
            }

            const {type, to, text, ...msgContent} = content;

            let message;

            switch (type) {
                case 'text':
                    message = this._tim.createTextMessage({
                        to: to,
                        conversationType: TIM.TYPES.CONV_C2C,
                        payload: {
                            text: text
                        }
                    });
                    break;

                case 'image':
                    message = this._tim.createImageMessage({
                        to: to,
                        conversationType: TIM.TYPES.CONV_C2C,
                        payload: {
                            file: msgContent.content
                        }
                    });
                    break;

                case 'voice':
                    message = this._tim.createCustomMessage({
                        to: to,
                        conversationType: TIM.TYPES.CONV_C2C,
                        payload: {
                            data: 'voice',
                            description: msgContent.content,
                            extension: JSON.stringify({duration: msgContent.duration})
                        }
                    });
                    break;

                default:
                    message = this._tim.createTextMessage({
                        to: to,
                        conversationType: TIM.TYPES.CONV_C2C,
                        payload: {
                            text: '未知消息类型'
                        }
                    });
            }

            // 发送消息
            this._tim.sendMessage(message).then((res) => {
                console.log('TIM消息发送成功', res);
                resolve({
                    message: {
                        id: res.data.message.ID,
                        content: text || msgContent.content,
                        isSelf: true,
                        createTime: Date.now(),
                        type: type
                    }
                });
            }).catch((error) => {
                console.error('TIM消息发送失败', error);
                reject(error);
            });
        });
    }

    /**
     * 获取会话列表
     */
    async getConversationList() {
        if (!this._tim) {
            return [];
        }

        // SDK 未就绪时不要调用，避免 code 3000 (sdk not ready) 报错
        // SDK_READY 后 CONVERSATION_LIST_UPDATED 事件会自动推送会话列表
        if (!this._isLogin) {
            console.warn('TIM SDK未就绪，跳过获取会话列表（等待 SDK_READY 后自动刷新）');
            return [];
        }

        try {
            const list = await this._tim.getConversationList();
            // 兼容新旧 SDK 返回结构：
            // 新版：list.data = { conversationList: [...], isSyncCompleted: bool }
            // 旧版：list.data = [...]
            const data = list && list.data;
            const conversations = Array.isArray(data)
                ? data
                : (data && data.conversationList) || [];
            return this._convertConversations(conversations);
        } catch (error) {
            console.error('获取会话列表失败', error);
            return [];
        }
    }

    /**
     * 创建群组
     */
    async createGroup({name, university}) {
        if (!this._tim) {
            throw new Error('TIM未初始化');
        }

        try {
            const groupID = `group_${university}`;
            const res = await this._tim.createGroup({
                type: TIM.TYPES.GRP_PUBLIC,
                name: name,
                groupID: groupID
            });
            console.log('创建群组成功', res);
            return res.data.group;
        } catch (error) {
            console.error('创建群组失败', error);
            throw error;
        }
    }

    /**
     * 加入群组
     */
    async joinGroup({groupID}) {
        if (!this._tim) {
            throw new Error('TIM未初始化');
        }

        try {
            await this._tim.joinGroup({ groupID });
            console.log('加入群组成功', groupID);
        } catch (error) {
            console.error('加入群组失败', error);
            throw error;
        }
    }

    /**
     * 关闭连接
     */
    closeConnection() {
        if (this._tim) {
            this._tim.logout().then(() => {
                console.log('TIM登出成功');
                this._isLogin = false;
            }).catch((error) => {
                console.error('TIM登出失败', error);
            });
        }
    }

    /**
     * 设置消息接收监听
     */
    setOnReceiveMessageListener({listener}) {
        this._receiveListener = listener;
    }

    /**
     * 转换TIM消息格式为项目格式
     */
    _convertTIMMessage(message) {
        const {type, to, from, payload, time} = message;

        let msgType = 'text';
        let content = '';

        switch (type) {
            case TIM.TYPES.MSG_TEXT:
                msgType = 'text';
                content = payload.text;
                break;
            case TIM.TYPES.MSG_IMAGE:
                msgType = 'image';
                content = payload.url;
                break;
            case TIM.TYPES.MSG_CUSTOM:
                try {
                    const data = JSON.parse(payload.extension);
                    if (payload.description === 'voice') {
                        msgType = 'voice';
                        content = payload.description;
                        return {
                            type: msgType,
                            content: content,
                            from: from,
                            time: time,
                            duration: data.duration
                        };
                    }
                } catch (e) {
                    msgType = 'custom';
                    content = payload.data;
                }
                break;
            default:
                msgType = 'text';
                content = '未知消息';
        }

        return {
            type: msgType,
            content: content,
            from: from,
            to: to,
            time: time
        };
    }

    /**
     * 转换TIM会话格式
     */
    _convertConversations(conversations) {
        // 检查conversations是否为数组
        if (!Array.isArray(conversations)) {
            console.warn('_convertConversations: conversations不是数组，返回空数组', conversations);
            return [];
        }

        return conversations.map(conv => {
            const lastMessage = conv.lastMessage;
            const userProfile = conv.userProfile || {};

            let lastMsgContent = '';
            if (lastMessage) {
                switch (lastMessage.type) {
                    case TIM.TYPES.MSG_TEXT:
                        lastMsgContent = lastMessage.payload.text;
                        break;
                    case TIM.TYPES.MSG_IMAGE:
                        lastMsgContent = '[图片]';
                        break;
                    case TIM.TYPES.MSG_CUSTOM:
                        lastMsgContent = '[语音]';
                        break;
                    default:
                        lastMsgContent = '[消息]';
                }
            }

            return {
                conversationId: conv.conversationID,
                friendId: conv.type === TIM.TYPES.CONV_C2C ? conv.to : '',
                friendName: userProfile.nick || userProfile.userID || '未知用户',
                friendHeadUrl: userProfile.avatar || '/image/other_head.jpg',
                latestMsg: JSON.stringify({
                    type: lastMessage ? lastMessage.type : 'text',
                    content: lastMsgContent
                }),
                timestamp: lastMessage ? lastMessage.lastTime * 1000 : Date.now(),
                timeStr: this._formatTime(lastMessage ? lastMessage.lastTime * 1000 : Date.now()),
                unread: conv.unreadCount
            };
        });
    }

    /**
     * 格式化时间
     */
    _formatTime(timestamp) {
        const date = new Date(timestamp);
        const hours = date.getHours();
        const minutes = date.getMinutes();
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
}
