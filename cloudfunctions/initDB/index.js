const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const COLLECTIONS = [
  {
    name: 'users',
    description: '用户信息表'
  },
  {
    name: 'chat_rooms',
    description: '聊天室表'
  },
  {
    name: 'friends',
    description: '好友关系表'
  },
  {
    name: 'users_profile',
    description: '用户资料表'
  }
]

exports.main = async (event, context) => {
  const results = []

  for (const collection of COLLECTIONS) {
    try {
      await db.createCollection(collection.name)
      results.push({
        name: collection.name,
        status: 'created',
        message: `集合 ${collection.name} 创建成功`
      })
      console.log(`[SUCCESS] 集合 ${collection.name} 创建成功`)
    } catch (err) {
      if (err.errCode === -501001 || (err.errMsg && err.errMsg.includes('already exists'))) {
        results.push({
          name: collection.name,
          status: 'exists',
          message: `集合 ${collection.name} 已存在`
        })
        console.log(`[INFO] 集合 ${collection.name} 已存在，跳过`)
      } else {
        results.push({
          name: collection.name,
          status: 'error',
          message: err.errMsg || err.message || '未知错误'
        })
        console.error(`[ERROR] 集合 ${collection.name} 创建失败:`, err)
      }
    }
  }

  const successCount = results.filter(r => r.status === 'created' || r.status === 'exists').length
  const errorCount = results.filter(r => r.status === 'error').length

  return {
    code: errorCount > 0 ? 1 : 0,
    message: errorCount > 0 ? `部分集合创建失败，成功 ${successCount} 个，失败 ${errorCount} 个` : `所有集合初始化完成，共 ${successCount} 个`,
    data: results,
    total: COLLECTIONS.length,
    success: successCount,
    error: errorCount
  }
}
