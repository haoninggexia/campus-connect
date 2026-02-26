// 云函数：获取用户资料的临时链接
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

exports.main = async (event, context) => {
  const { userID } = event
  
  try {
    // 查询用户资料
    const result = await db.collection('users_profile').where({
      userID: userID
    }).get()
    
    if (result.data.length === 0) {
      return {
        code: -1,
        msg: '用户资料不存在'
      }
    }
    
    const profile = result.data[0]
    const processedProfile = { ...profile }
    
    // 获取自定义头像的临时下载链接
    if (profile.customAvatar) {
      try {
        const tempUrl = await cloud.getTempFileURL({
          fileList: [profile.customAvatar]
        })
        if (tempUrl.fileList && tempUrl.fileList[0] && tempUrl.fileList[0].tempFileURL) {
          processedProfile.customAvatarTemp = tempUrl.fileList[0].tempFileURL
        }
      } catch (e) {
        console.error('获取头像临时链接失败:', e)
      }
    }
    
    // 获取精选照片的临时下载链接
    if (profile.photos && Array.isArray(profile.photos) && profile.photos.length > 0) {
      const validPhotos = profile.photos.filter(photo => photo && typeof photo === 'string' && photo.trim() !== '')
      
      if (validPhotos.length > 0) {
        try {
          const tempRes = await cloud.getTempFileURL({
            fileList: validPhotos
          })
          
          if (tempRes.fileList) {
            const tempUrls = tempRes.fileList
              .filter(item => item.tempFileURL)
              .map(item => item.tempFileURL)
            processedProfile.photosTemp = tempUrls
          }
        } catch (e) {
          console.error('获取照片临时链接失败:', e)
        }
      }
    }
    
    return {
      code: 0,
      msg: '获取成功',
      data: processedProfile
    }
  } catch (e) {
    console.error('获取用户资料失败:', e)
    return {
      code: -1,
      msg: '获取失败',
      error: e.message
    }
  }
}
