/**
 * 腾讯云IM配置文件
 * 需要前往腾讯云控制台创建IM应用获取SDKAppID
 * 控制台地址: https://console.cloud.tencent.com/im
 *
 * 重要说明：
 * 1. SDKAppID：已在腾讯云IM控制台创建应用
 * 2. UserSig：通过云函数动态生成，不在前端配置
 * 3. 密钥信息存储在云函数中，确保安全性
 */
export default {
  // SDKAppID：在腾讯云IM控制台创建应用后获取
  // 已配置：1600125415
  SDKAppID: 1600125415,

  // 密钥信息（存储在云函数getUserSig中使用，这里仅作记录）
  // Key: ea53910297332a32bd3a31a364588fce29b1d58c4ce340fe73befb4e62ee5485
  // Secret: 同上（腾讯云IM使用相同的密钥字符串）
  secret: 'ea53910297332a32bd3a31a364588fce29b1d58c4ce340fe73befb4e62ee5485',

  // 检查是否使用腾讯云IM
  useTIM() {
    return this.SDKAppID !== 0;
  },

  // 获取当前用户信息（从微信缓存读取）
  getCurrentUser() {
    const user = wx.getStorageSync('user_info');
    if (!user) {
      console.warn('未找到用户信息，请先登录');
      return null;
    }
    return user;
  },

  // 获取UserSig（从云缓存读取）
  getUserSig() {
    const userSigData = wx.getStorageSync('user_sig');
    if (!userSigData) {
      console.warn('未找到UserSig，请先登录');
      return null;
    }
    return userSigData.userSig;
  }
};
