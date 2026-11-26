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
  },
  {
    name: 'online_users',
    description: '在线用户状态表（心跳上报）'
  },
  {
    name: 'app_config',
    description: '应用配置表（开放时间、状态快照等）'
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

  // 初始化开放时间默认配置（已存在则跳过）
  try {
    await db.collection('app_config').doc('open_time').get()
    results.push({
      name: 'app_config/open_time',
      status: 'exists',
      message: '开放时间配置已存在'
    })
  } catch (e) {
    try {
      await db.collection('app_config').add({
        data: {
          _id: 'open_time',
          enabled: true,
          message: '',
          windows: [
            { days: [1, 2, 3, 4, 5, 6, 7], start: '21:00', end: '23:00' }
          ],
          datesOverride: {},
          remark: '每晚 21:00-23:00 开放。days: 1=周一 ... 7=周日；enabled=false 表示不限制；datesOverride 可做节假日特殊安排',
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
      results.push({
        name: 'app_config/open_time',
        status: 'created',
        message: '默认开放时间配置已写入（每晚 21:00-23:00）'
      })
    } catch (err) {
      results.push({
        name: 'app_config/open_time',
        status: 'error',
        message: err.errMsg || err.message || '写入默认配置失败'
      })
    }
  }

  // 初始化管理端配置（隐藏管理页使用，已存在则跳过）
  try {
    await db.collection('app_config').doc('admin').get()
    results.push({
      name: 'app_config/admin',
      status: 'exists',
      message: '管理端配置已存在'
    })
  } catch (e) {
    try {
      await db.collection('app_config').add({
        data: {
          _id: 'admin',
          enabled: true,
          salt: '',
          password: 'echo@2026',
          passwordHash: '',
          openids: [],
          remark: '管理端配置。password/passwordHash 任一匹配即可登录；openids 非空时仅白名单内 openid 可进入；enabled=false 关闭管理入口',
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
      results.push({
        name: 'app_config/admin',
        status: 'created',
        message: '默认管理配置已写入（默认密码 echo@2026，请尽快修改）'
      })
    } catch (err) {
      results.push({
        name: 'app_config/admin',
        status: 'error',
        message: err.errMsg || err.message || '写入管理配置失败'
      })
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
