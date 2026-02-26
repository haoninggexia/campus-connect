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

// ⚠️ 替换为你在腾讯云IM控制台获取的配置
const SDKAppID = 1600125415
const privateKey = 'ea53910297332a32bd3a31a364588fce29b1d58c4ce340fe73befb4e62ee5485'

exports.main = async (event, context) => {
  const { userID, expire } = event

  if (!userID) {
    return {
      code: 400,
      message: 'userID不能为空'
    }
  }

  console.log('[DEBUG] 生成UserSig，userID:', userID)

  try {
    // 使用腾讯云官方UserSig生成库
    const api = new Api(SDKAppID, privateKey)

    // 设置UserSig过期时间（默认180天）
    const expireTime = expire || 180 * 86400

    // 生成UserSig
    const userSig = api.genUserSig(userID, expireTime)

    console.log('[DEBUG] UserSig生成成功，有效期:', expireTime, '秒')
    console.log('[DEBUG] UserSig长度:', userSig.length)
    console.log('[DEBUG] UserSig前50字符:', userSig.substring(0, 50))

    return {
      code: 0,
      message: 'success',
      data: {
        userID,
        userSig,
        SDKAppID: SDKAppID
      }
    }
  } catch (error) {
    console.error('[ERROR] 生成UserSig失败', error)
    return {
      code: 500,
      message: '生成UserSig失败',
      error: error.message
    }
  }
}
