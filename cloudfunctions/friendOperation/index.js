// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, myUserID, friendUserID, friendNickName, friendAvatar } = event
  const wxContext = cloud.getWXContext()

  console.log('friendOperation云函数被调用', { action, myUserID, friendUserID, wxContext })

  try {
    if (action === 'add') {
      // 添加好友（双向）
      const createTime = new Date()

      // 获取当前用户信息
      const userInfo = await db.collection('users')
        .where({
          userID: myUserID
        })
        .get()

      if (!userInfo.data || userInfo.data.length === 0) {
        return {
          code: -1,
          message: '当前用户不存在'
        }
      }

      const currentUser = userInfo.data[0]

      // 检查是否已经是好友
      const existingFriend = await db.collection('friends')
        .where({
          myUserID: myUserID,
          friendUserID: friendUserID
        })
        .get()

      if (existingFriend.data && existingFriend.data.length > 0) {
        return {
          code: -2,
          message: '已经是好友了'
        }
      }

      // 添加好友关系（双向）
      await db.collection('friends').add({
        data: {
          myUserID: myUserID,
          friendUserID: friendUserID,
          friendNickName: friendNickName,
          friendAvatar: friendAvatar,
          createTime: createTime
        }
      })

      await db.collection('friends').add({
        data: {
          myUserID: friendUserID,
          friendUserID: myUserID,
          friendNickName: currentUser.nickName,
          friendAvatar: currentUser.avatarUrl,
          createTime: createTime
        }
      })

      return {
        code: 0,
        message: '添加成功'
      }
    }

    else if (action === 'delete') {
      // 删除好友（双向）
      await db.collection('friends')
        .where({
          myUserID: myUserID,
          friendUserID: friendUserID
        })
        .remove()

      await db.collection('friends')
        .where({
          myUserID: friendUserID,
          friendUserID: myUserID
        })
        .remove()

      return {
        code: 0,
        message: '删除成功'
      }
    }

    else if (action === 'getFriends') {
      // 获取好友列表
      const result = await db.collection('friends')
        .where({
          myUserID: myUserID
        })
        .get()

      return {
        code: 0,
        data: result.data
      }
    }

    else {
      return {
        code: -1,
        message: '未知操作'
      }
    }

  } catch (e) {
    console.error('friendOperation云函数执行失败', e)
    return {
      code: -1,
      message: e.message || '操作失败'
    }
  }
}
