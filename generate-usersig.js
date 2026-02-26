/**
 * UserSig生成工具 - 多用户版本
 * 用于开发测试环境生成UserSig
 * 注意：正式环境需要在服务端生成，不要在前端暴露密钥
 *
 * 使用步骤：
 * 1. 在腾讯云IM控制台获取SDKAppID和密钥
 * 2. 修改下面的SDKAPPID和KEY
 * 3. 运行此脚本：node generate-usersig.js
 * 4. 将生成的配置复制到 utils/tim-config.js 中
 */

const CryptoJS = require('crypto-js');

/**
 * 生成UserSig
 * @param {string} sdkappid - SDKAppID
 * @param {string} userId - 用户ID
 * @param {string} key - 密钥（在腾讯云IM控制台获取）
 * @param {number} expire - 过期时间（秒），默认7天
 */
function genUserSig(sdkappid, userId, key, expire = 7 * 24 * 3600) {
    const currTime = Math.floor(Date.now() / 1000);
    const sig = {
        'TLS.ver': '2.0',
        'TLS.identifier': userId,
        'TLS.sdkappid': Number(sdkappid),
        'TLS.expire': expire,
        'TLS.time': currTime
    };

    const sigStr = JSON.stringify(sig);
    const sigBase64 = Buffer.from(sigStr).toString('base64');

    // 使用HMAC-SHA256生成签名
    const hmac = CryptoJS.HmacSHA256(sigBase64, key);
    const sigHex = hmac.toString(CryptoJS.enc.Hex);

    const userSig = sigBase64 + ':' + sigHex;
    const userSigBase64 = Buffer.from(userSig).toString('base64');

    return userSigBase64;
}

// ================== 配置区域 ==================
// 请在此处配置你的腾讯云IM信息
const SDKAPPID = 1600125415; // ⚠️ 替换为你的SDKAppID
const KEY = 'ea53910297332a32bd3a31a364588fce29b1d58c4ce340fe73befb4e62ee5485 '; // ⚠️ 从腾讯云IM控制台获取的密钥

// 定义需要生成UserSig的用户列表
const USERS = [
    { userID: 'user_001', nickName: '用户1' },
    { userID: 'user_002', nickName: '用户2' },
    { userID: 'user_003', nickName: '用户3' }
];
// ===============================================

console.log('================ UserSig生成工具（多用户版本） ================');
console.log('');
console.log('当前配置：');
console.log('SDKAppID:', SDKAPPID);
console.log('用户数量:', USERS.length);
console.log('过期时间: 7 天');
console.log('');

if (SDKAPPID === 0) {
    console.error('❌ 错误：请先配置SDKAppID');
    console.log('');
    console.log('配置步骤：');
    console.log('1. 访问：https://console.cloud.tencent.com/im');
    console.log('2. 点击你的应用 -> 应用配置');
    console.log('3. 复制"SDKAppID"到本文件的SDKAPPID变量');
    console.log('');
} else if (!KEY) {
    console.error('❌ 错误：请先从腾讯云IM控制台获取密钥KEY');
    console.log('');
    console.log('获取密钥步骤：');
    console.log('1. 访问：https://console.cloud.tencent.com/im');
    console.log('2. 点击你的应用 -> 应用配置');
    console.log('3. 找到"密钥"部分，复制"UserSig私钥"到本文件的KEY变量');
    console.log('');
} else {
    console.log('正在为用户生成UserSig...\n');

    try {
        const userConfigs = USERS.map((user, index) => {
            const userSig = genUserSig(SDKAPPID, user.userID, KEY);
            return `    {
      userID: '${user.userID}',
      userSig: '${userSig}',
      nickName: '${user.nickName}'
    }${index < USERS.length - 1 ? ',' : ''}`;
        });

        console.log('✅ UserSig生成成功！');
        console.log('');
        console.log('请将以下配置复制到 utils/tim-config.js 文件中：\n');
        console.log('```');
        console.log('  SDKAppID: ' + SDKAPPID + ',  // 替换0为你的SDKAppID\n');
        console.log('  users: [');
        userConfigs.forEach(config => console.log(config));
        console.log('  ],');
        console.log('```');
        console.log('');
        console.log('💡 提示：');
        console.log('1. 将上面生成的配置替换到 utils/tim-config.js 中');
        console.log('2. 在不同设备上，修改 currentUserIndex 来使用不同的用户');
        console.log('3. UserSig有效期7天，过期后需要重新生成');
        console.log('');

        // 输出每个用户的UserSig单独显示
        console.log('各用户UserSig列表：\n');
        USERS.forEach(user => {
            const userSig = genUserSig(SDKAPPID, user.userID, KEY);
            console.log(`${user.userID} (${user.nickName}):`);
            console.log(userSig);
            console.log('');
        });

    } catch (error) {
        console.error('❌ 生成失败:', error.message);
        console.log('');
        console.log('请检查：');
        console.log('1. SDKAppID是否正确');
        console.log('2. 密钥KEY是否正确');
        console.log('3. 网络连接是否正常');
    }
}

module.exports = genUserSig;
