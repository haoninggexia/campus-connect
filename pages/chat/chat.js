// pages/list/list.js
import IMOperator from "./im-operator";
import UI from "./ui";
import MsgManager from "./msg-manager";

/**
 * 聊天页面
 */
Page({

    /**
     * 页面的初始数据
     */
    data: {
        textMessage: '',
        chatItems: [],
        latestPlayVoicePath: '',
        chatStatue: 'open',
        extraArr: [{
            picName: 'choose_picture',
            description: '照片'
        }, {
            picName: 'take_photos',
            description: '拍摄'
        }, {
            picName: 'close_chat',
            description: '自定义功能'
        }],
    },

    /**
     * 生命周期函数--监听页面加载
     */
    onLoad(options) {
        try {
            if (!options.friend) {
                wx.showToast({title: '参数错误', icon: 'none'});
                return;
            }
            const friend = typeof options.friend === 'string' ? JSON.parse(options.friend) : options.friend;
            console.log(friend);
            this.setData({
                pageHeight: wx.getSystemInfoSync().windowHeight,
            });
            wx.setNavigationBarTitle({
                title: friend.friendName || ''
            });
            this.imOperator = new IMOperator(this, friend);
            this.UI = new UI(this);
            this.msgManager = new MsgManager(this);

            this.imOperator.onSimulateReceiveMsg((msg) => {
                this.msgManager.showMsg({msg})
            });
            this.UI.updateChatStatus('正在聊天中...');
        } catch (e) {
            console.error('解析friend参数失败:', e, options);
            wx.showToast({title: '参数错误', icon: 'none'});
            // 设置默认值防止后续调用出错
            this.setData({pageHeight: wx.getSystemInfoSync().windowHeight});
        }
    },
    onReady() {
        this.chatInput = this.selectComponent('#chatInput');
    },
    onSendMessageEvent(e) {
        if (!this.msgManager) {
            wx.showToast({title: '初始化失败', icon: 'none'});
            return;
        }
        let content = e.detail.value;
        this.msgManager.sendMsg({type: IMOperator.TextType, content});
    },
    onVoiceRecordEvent(e) {
        const {detail: {recordStatus, duration, tempFilePath, fileSize,}} = e;
        if (recordStatus === 2) {
            this.msgManager.sendMsg({
                type: IMOperator.VoiceType,
                content: tempFilePath,
                duration: Math.floor(duration / 1000)
            });
        }
        this.msgManager.stopAllVoice();
    },
    /**
     * 点击extra中的item时触发
     * @param e
     */
    onExtraItemClickEvent(e) {
        console.warn(e);
        let chooseIndex = parseInt(e.detail.index);
        if (chooseIndex === 2) {
            this.myFun();
            return;
        }
        wx.chooseImage({
            count: 1, // 默认9
            sizeType: ['compressed'],
            sourceType: chooseIndex === 0 ? ['album'] : ['camera'],
            success: (res) => {
                this.msgManager.sendMsg({type: IMOperator.ImageType, content: res.tempFilePaths[0]})
            },
            fail: (err) => {
                console.error('选择图片失败:', err);
                wx.showToast({
                    title: '打开相册失败，请检查权限',
                    icon: 'none',
                    duration: 2000
                });
            }
        });
    },
    /**
     * 点击extra按钮时触发
     * @param e
     */
    onExtraClickEvent(e) {
        console.log(e);
    },
    //模拟上传文件，注意这里的cbOk回调函数传入的参数应该是上传文件成功时返回的文件url，这里因为模拟，我直接用的savedFilePath
    simulateUploadFile({savedFilePath, duration, itemIndex}) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                let urlFromServerWhenUploadSuccess = savedFilePath;
                resolve({url: urlFromServerWhenUploadSuccess});
            }, 1000);
        });
    },

    /**
     * 自定义事件
     */
    myFun() {
        wx.showModal({
            title: '小贴士',
            content: '演示更新会话状态',
            confirmText: '确认',
            showCancel: true,
            success: (res) => {
                if (res.confirm) {
                    this.msgManager.sendMsg({type: IMOperator.CustomType})
                }
            }
        })
    },

    resetInputStatus() {
        this.chatInput.closeExtraView();
    },

    onUnload() {
        this.msgManager.stopAllVoice();
    },

    async sendMsg({content, itemIndex}) {
        try {
            console.log('sendMsg调用', {content, itemIndex, chatItemsLength: this.data.chatItems.length});
            const {msg} = await this.imOperator.onSimulateSendMsg({content})
            console.log('发送消息成功', {msg, itemIndex});
            this.UI.updateViewWhenSendSuccess(msg, itemIndex);
            return {msg};
        } catch (e) {
            console.error('发送消息失败', e);
            this.UI.updateViewWhenSendFailed(itemIndex);
        }
    },
    /**
     * 重发消息
     * @param e
     */
    resendMsgEvent(e) {
        const itemIndex = parseInt(e.currentTarget.dataset.resendIndex);
        const item = this.data.chatItems[itemIndex];
        this.UI.updateDataWhenStartSending(item, false, false);
        this.msgManager.resend({...item, itemIndex});
    },
});
