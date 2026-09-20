// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

// 云存储文件临时链接缓存（云函数容器复用期间生效，避免每次轮询都重复生成）
// 适用：图片、语音、视频、文件 等所有 cloud:// fileID
// fileID -> { url, expireAt }
const cloudFileUrlCache = new Map()
const CLOUD_FILE_URL_CACHE_TTL = 60 * 60 * 1000 // 缓存 60 分钟

/**
 * 批量把云存储 fileID 转成临时 https 链接
 * 关键点：云函数拥有管理员权限，不受云存储「仅创建者可读」安全规则限制，
 *        因此可以为「非上传者」生成可访问链接，解决对方发的图片/语音加载不出来的问题。
 * @param {string[]} fileIDs
 * @returns {Promise<Object>} fileID -> 临时链接 的映射
 */
async function buildImageTempUrls(fileIDs) {
  const urlMap = {}
  const now = Date.now()
  const needFetch = []

  fileIDs.forEach((fileID) => {
    const cached = cloudFileUrlCache.get(fileID)
    if (cached && cached.expireAt > now) {
      urlMap[fileID] = cached.url
    } else {
      needFetch.push(fileID)
    }
  })

  if (needFetch.length === 0) {
    return urlMap
  }

  // getTempFileURL 单次最多 50 个
  for (let i = 0; i < needFetch.length; i += 50) {
    const batch = needFetch.slice(i, i + 50)
    try {
      const res = await cloud.getTempFileURL({ fileList: batch })
      const list = (res && res.fileList) || []
      list.forEach((item) => {
        if (item && item.fileID && item.tempFileURL) {
          urlMap[item.fileID] = item.tempFileURL
          cloudFileUrlCache.set(item.fileID, {
            url: item.tempFileURL,
            expireAt: now + CLOUD_FILE_URL_CACHE_TTL
          })
        } else if (item && item.fileID) {
          console.warn('云文件临时链接获取失败:', item.fileID, item.status, item.errMsg)
        }
      })
    } catch (e) {
      console.error('批量生成云文件临时链接失败:', e)
    }
  }

  return urlMap
}

/**
 * 获取聊天室消息
 */
exports.main = async (event, context) => {
  const { roomId } = event
  
  try {
    const result = await db.collection('chat_rooms').doc(roomId).get()
    const room = result.data
    
    if (!room) {
      return { code: -1, msg: '房间不存在' }
    }
    
    // 为用户头像生成临时下载链接
    const processUser = async (user) => {
      if (!user) {
        console.log('用户为空，跳过处理')
        return null
      }

      const processedUser = { ...user }

      console.log('处理用户头像，用户ID:', user.userID, '是否有自定义头像:', !!user.customAvatar, '自定义头像:', user.customAvatar)

      // 如果有自定义头像，获取临时链接
      if (user.customAvatar) {
        try {
          const tempUrl = await cloud.getTempFileURL({
            fileList: [user.customAvatar]
          })
          console.log('头像临时链接结果:', user.userID, tempUrl)

          if (tempUrl.fileList && tempUrl.fileList[0] && tempUrl.fileList[0].tempFileURL) {
            processedUser.customAvatarTemp = tempUrl.fileList[0].tempFileURL
            console.log('头像临时链接设置成功:', user.userID, processedUser.customAvatarTemp)
          } else {
            console.log('头像临时链接获取失败，返回数据:', tempUrl)
          }
        } catch (e) {
          console.error('获取头像临时链接失败:', user.userID, e)
        }
      } else {
        console.log('用户没有自定义头像:', user.userID)
      }

      return processedUser
    }
    
    const [processedUser1, processedUser2] = await Promise.all([
      processUser(room.user1),
      processUser(room.user2)
    ])
    
    // ---- 媒体消息处理：cloud:// fileID -> 临时 https 链接（图片、语音、文件通用）----
    const rawMessages = room.messages || []
    const cloudFileIDs = []
    rawMessages.forEach((msg) => {
      // 所有以 cloud:// 开头的 content 都视为云存储文件（图片、语音、视频、文件等）
      if (
        msg &&
        typeof msg.content === 'string' &&
        msg.content.indexOf('cloud://') === 0 &&
        cloudFileIDs.indexOf(msg.content) === -1
      ) {
        cloudFileIDs.push(msg.content)
      }
    })

    let urlMap = {}
    if (cloudFileIDs.length > 0) {
      urlMap = await buildImageTempUrls(cloudFileIDs)
      console.log('云文件临时链接处理完成，数量:', cloudFileIDs.length)
    }

    const messages = rawMessages.map((msg) => {
      if (msg && typeof msg.content === 'string' && msg.content.indexOf('cloud://') === 0 && urlMap[msg.content]) {
        // 保留原始 fileID，content 换成临时链接（接收方也能访问，且支持预览/播放）
        return { ...msg, content: urlMap[msg.content], fileID: msg.content }
      }
      return msg
    })

    return {
      code: 0,
      msg: '获取成功',
      data: {
        messages,
        status: room.status,
        user1: processedUser1,
        user2: processedUser2
      }
    }
  } catch (e) {
    console.error('获取消息失败:', e)
    return {
      code: -1,
      msg: '获取失败',
      error: e.message
    }
  }
}
