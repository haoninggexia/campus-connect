/**
 * 使用腾讯云官方库源码测试UserSig生成
 * 不依赖外部npm包，直接使用官方源码
 *
 * 使用方法：
 * node test-usersig-official.js <userID>
 */

const crypto = require('crypto');
const zlib = require('zlib');

// ==================== 腾讯云官方UserSig生成库源码 ====================
var base64url = {};
var newBuffer = function (fill, encoding) {
  return Buffer.from ? Buffer.from(fill, encoding) : new Buffer(fill, encoding)
};
base64url.unescape = function unescape(str) {
  return (str + Array(5 - str.length % 4))
    .replace(/_/g, '=')
    .replace(/\-/g, '/')
    .replace(/\*/g, '+');
};
base64url.escape = function escape(str) {
  return str.replace(/\+/g, '*')
    .replace(/\//g, '-')
    .replace(/=/g, '_');
};
base64url.encode = function encode(str) {
  return this.escape(newBuffer(str).toString('base64'));
};
base64url.decode = function decode(str) {
  return newBuffer(this.unescape(str), 'base64').toString();
};

function base64encode(str) {
  return newBuffer(str).toString('base64')
}
function base64decode(str) {
  return newBuffer(str, 'base64').toString()
}

var Api = function (sdkappid, key) {
  this.sdkappid = sdkappid;
  this.key = key;
};

Api.prototype._hmacsha256 = function (identifier, currTime, expire, base64UserBuf) {
  var contentToBeSigned = "TLS.identifier:" + identifier + "\n";
  contentToBeSigned += "TLS.sdkappid:" + this.sdkappid + "\n";
  contentToBeSigned += "TLS.time:" + currTime + "\n";
  contentToBeSigned += "TLS.expire:" + expire + "\n";
  if (null != base64UserBuf) {
    contentToBeSigned += "TLS.userbuf:" + base64UserBuf + "\n";
  }
  const hmac = crypto.createHmac("sha256", this.key);
  return hmac.update(contentToBeSigned).digest('base64');
};

Api.prototype.genSig = function (userid, expire, userBuf) {
  var currTime = Math.floor(Date.now() / 1000);
  var sigDoc = {
    'TLS.ver': "2.0",
    'TLS.identifier': "" + userid,
    'TLS.sdkappid': Number(this.sdkappid),
    'TLS.time': Number(currTime),
    'TLS.expire': Number(expire)
  };
  var sig = '';
  if (null != userBuf) {
    var base64UserBuf = base64encode(userBuf);
    sigDoc['TLS.userbuf'] = base64UserBuf;
    sig = this._hmacsha256(userid, currTime, expire, base64UserBuf);
  } else {
    sig = this._hmacsha256(userid, currTime, expire, null);
  }
  sigDoc['TLS.sig'] = sig;
  var compressed = zlib.deflateSync(newBuffer(JSON.stringify(sigDoc))).toString('base64');
  return base64url.escape(compressed);
}

Api.prototype.genUserSig = function (userid, expire) {
  return this.genSig(userid, expire, null);
};
// ==================== 官方库源码结束 ====================

const SDKAppID = 1600125415
const privateKey = 'ea53910297332a32bd3a31a364588fce29b1d58c4ce340fe73befb4e62ee5485'

// 从命令行获取userID
const userID = process.argv[2] || 'test_user_001'

console.log('========================================')
console.log('使用腾讯云官方库源码测试UserSig生成')
console.log('========================================')
console.log('SDKAppID:', SDKAppID)
console.log('UserID:', userID)
console.log('密钥长度:', privateKey.length)
console.log('========================================')
console.log('')

try {
  // 创建API实例
  const api = new Api(SDKAppID, privateKey)

  // 生成UserSig（有效期180天）
  const userSig = api.genUserSig(userID, 180 * 86400)

  console.log('生成的UserSig:')
  console.log(userSig)
  console.log('')
  console.log('UserSig长度:', userSig.length)
  console.log('UserSig前50字符:', userSig.substring(0, 50))
  console.log('')
  console.log('========================================')
  console.log('验证步骤:')
  console.log('1. 访问腾讯云IM控制台: https://console.cloud.tencent.com/im')
  console.log('2. 进入你的应用 -> 开发辅助工具 -> UserSig生成校验')
  console.log('3. 输入相同的UserID:', userID)
  console.log('4. 查看控制台生成的UserSig')
  console.log('5. 与本脚本生成的UserSig进行对比')
  console.log('6. 使用官方库生成的UserSig应该与控制台完全相同！')
  console.log('========================================')

} catch (error) {
  console.error('生成UserSig失败:', error)
}
