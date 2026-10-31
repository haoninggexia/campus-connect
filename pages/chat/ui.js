/**
 * 用户处理消息的收发UI更新
 */
export default class UI {
    constructor(page) {
        this._page = page;
    }

    /**
     * 接收到消息时，更新UI
     * @param msg
     */
    updateViewWhenReceive(msg) {
        this._page.data.chatItems.push(msg);
        this._page.setData({
            chatItems: this._page.data.chatItems.sort(UI._sortMsgListByTimestamp),
            scrollTopVal: this._page.data.chatItems.length * 999,
        });
    }

    /**
     * 发送消息时，渲染消息的发送状态为 发送中
     * @param sendMsg
     */
    async showItemForMoment(sendMsg) {
        if (!sendMsg) {
            console.error('sendMsg为空');
            return {itemIndex: -1};
        }
        this.updateDataWhenStartSending(sendMsg);
        const itemIndex = this._page.data.chatItems.length - 1;
        console.log('showItemForMoment返回itemIndex:', itemIndex, 'chatItems长度:', this._page.data.chatItems.length);
        return {itemIndex};
    }

    /**
     * 设置消息发送状态为 发送中
     * @param sendMsg
     * @param addToArr
     * @param needScroll
     */
    updateDataWhenStartSending(sendMsg, addToArr = true, needScroll = true) {
        this._page.chatInput.closeExtraView();
        sendMsg.sendStatus = 'sending';
        if (addToArr) {
            this._page.data.chatItems.push(sendMsg);
            console.log('消息已添加到chatItems，新长度:', this._page.data.chatItems.length, '消息内容:', sendMsg);
        }
        let obj = {};
        obj['textMessage'] = '';
        obj['chatItems'] = this._page.data.chatItems;
        needScroll && (obj['scrollTopVal'] = this._page.data.chatItems.length * 999);
        this._page.setData(obj);
    }

    /**
     * 设置消息发送状态为 发送成功
     * @param sendMsg
     * @param itemIndex
     */
    updateViewWhenSendSuccess(sendMsg, itemIndex) {
        console.log('发送成功', {sendMsg, itemIndex});
        let that = this._page;
        if (itemIndex === undefined || itemIndex === null || itemIndex < 0) {
            console.error('itemIndex无效:', itemIndex);
            return;
        }
        let item = that.data.chatItems[itemIndex];
        if (!item) {
            console.error('未找到item，itemIndex:', itemIndex, 'chatItems:', that.data.chatItems);
            return;
        }
        item.timestamp = sendMsg.timestamp;
        this.updateSendStatusView('success', itemIndex);
    }

    updateListViewBySort() {
        this._page.setData({
            chatItems: this._page.data.chatItems.sort(UI._sortMsgListByTimestamp)
        })
    }

    /**
     * 设置消息发送状态为 发送失败
     * @param itemIndex
     */
    updateViewWhenSendFailed(itemIndex) {
        this.updateSendStatusView('failed', itemIndex);
    }

    updateSendStatusView(status, itemIndex) {
        let that = this._page;
        that.data.chatItems[itemIndex].sendStatus = status;
        let obj = {};
        obj[`chatItems[${itemIndex}].sendStatus`] = status;
        that.setData(obj);
    }

    updateChatStatus(content, open = true) {
        this._page.setData({
            chatStatue: open ? 'open' : 'close',
            chatStatusContent: content
        })
    }

    static _sortMsgListByTimestamp(item1, item2) {
        return item1.timestamp - item2.timestamp;
    }
}
