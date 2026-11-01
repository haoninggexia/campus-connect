// 云函数：未开放时段收集用户邮箱，开放时用于邮件通知
// 数据存于 email_subscribers 集合，以 email 摘要作为 _id 去重
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const COLLECTION = 'email_subscribers'
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
const MAX_EMAIL_LEN = 100

async function ensureCollection() {
  try {
    await db.createCollection(COLLECTION)
  } catch (e) {
    if (e.errCode === -501001 || (e.errMsg && e.errMsg.includes('already exists'))) {
      return
    }
    throw e
  }
}

// 查询当前用户是否已登记过邮箱
async function findByOpenid(openid) {
  const res = await db.collection(COLLECTION).where({ openid }).limit(1).get()
  return res.data && res.data.length ? res.data[0] : null
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || ''
  const action = event.action || 'subscribe'

  try {
    await ensureCollection()

    if (action === 'check') {
      const doc = await findByOpenid(openid)
      return {
        code: 0,
        subscribed: !!doc,
        email: doc ? doc.email : ''
      }
    }

    if (action === 'subscribe') {
      const email = typeof event.email === 'string' ? event.email.trim().toLowerCase() : ''
      // 未带学校时（如历史入口）统一归入山东中医药大学
      const DEFAULT_SCHOOL = '山东中医药大学'
      const school = (typeof event.school === 'string' && event.school.trim())
        ? event.school.trim()
        : DEFAULT_SCHOOL
      if (!email || email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
        return { code: 400, msg: '邮箱格式不正确' }
      }

      // 同一邮箱用摘要做 _id，天然去重；同一 openid 重复提交也只保留一条
      const emailId = crypto.createHash('md5').update(email).digest('hex')
      const existed = await db.collection(COLLECTION).where({ email }).limit(1).get()
      const existedDoc = existed.data && existed.data.length ? existed.data[0] : null

      if (existedDoc) {
        // 已存在：刷新 openid、时间，并记录最新学校
        const updateData = {
          openid,
          subscribeTime: db.serverDate()
        }
        if (school) updateData.school = school
        await db.collection(COLLECTION).doc(existedDoc._id).update({ data: updateData })
      } else {
        const addData = {
          _id: emailId,
          email,
          openid,
          subscribeTime: db.serverDate()
        }
        if (school) addData.school = school
        await db.collection(COLLECTION).add({ data: addData })
      }

      return { code: 0, msg: '登记成功', email }
    }

    return { code: 400, msg: `未知操作：${action}` }
  } catch (e) {
    console.error('[subscribeEmail] 失败:', e)
    return { code: -1, msg: '提交失败，请稍后再试', error: e.message }
  }
}
