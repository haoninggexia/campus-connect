/**
 * TIM SDK 动态加载器
 * 通过CDN动态加载TIM SDK，避免npm构建问题
 */
module.exports = {
  load: function() {
    return new Promise((resolve, reject) => {
      // 检查是否已加载
      if (typeof window !== 'undefined' && window.TencentCloudSDK && window.TencentCloudSDK.TIM) {
        resolve(window.TencentCloudSDK.TIM);
        return;
      }

      // 创建script标签动态加载SDK
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/tim-wx-sdk@2.27.6/dist/tim-wx.js';
      script.onload = () => {
        console.log('TIM SDK加载成功');
        resolve(window.TencentCloudSDK.TIM);
      };
      script.onerror = (error) => {
        console.error('TIM SDK加载失败', error);
        reject(error);
      };
      document.head.appendChild(script);
    });
  }
};
