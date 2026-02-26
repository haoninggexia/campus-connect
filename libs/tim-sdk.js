// TIM SDK Wrapper
// 通过eval方式加载tim-wx.js并导出
const TIM = (function() {
  // 加载tim-wx.js
  try {
    const timWx = require('../tim-wx.js');
    return timWx.default || timWx;
  } catch (error) {
    console.error('加载TIM SDK失败', error);
    return null;
  }
})();

module.exports = TIM;
