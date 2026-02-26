// pages/font-size/font-size.js
const fontSizeLevels = [
  { name: '特小', size: 24 },    // 0
  { name: '小', size: 28 },      // 1
  { name: '较小', size: 32 },    // 2
  { name: '标准', size: 36 },    // 3
  { name: '较大', size: 40 },    // 4
  { name: '大', size: 44 },      // 5
  { name: '特大', size: 48 },    // 6
  { name: '超特大', size: 52 }   // 7
]

Page({
  data: {
    fontSizeLevels,
    currentLevel: 3, // 默认标准大小
    currentSize: 36
  },

  onLoad(options) {
    console.log('=== 字体大小设置页面 onLoad ===')
    console.log('页面参数:', options)

    // 从本地存储获取用户设置的字体大小
    const savedFontSize = wx.getStorageSync('chatFontSize')
    console.log('保存的字体大小:', savedFontSize)

    if (savedFontSize !== undefined) {
      const level = fontSizeLevels.findIndex(level => level.size === savedFontSize)
      console.log('找到的档位:', level)
      if (level !== -1) {
        this.setData({
          currentLevel: level,
          currentSize: savedFontSize
        })
        console.log('设置数据成功:', { currentLevel: level, currentSize: savedFontSize })
      }
    }

    console.log('onLoad 完成，当前数据:', this.data)
  },

  onSliderInput(e) {
    console.log('=== 滑块实时输入 ===')
    console.log('事件对象:', e)
    console.log('当前值:', e.detail.value)
  },

  onSliderChange(e) {
    console.log('=== 滑块值改变 ===')
    console.log('事件对象:', e)
    console.log('新值:', e.detail.value)

    const level = e.detail.value
    const size = fontSizeLevels[level].size
    console.log('计算出的档位:', level, '字体大小:', size)

    this.setData({
      currentLevel: level,
      currentSize: size
    })

    console.log('数据更新后:', this.data)

    // 更新预览字体大小
    this.updatePreviewFontSize(size)
  },

  updatePreviewFontSize(size) {
    console.log('=== 更新预览字体大小 ===')
    console.log('目标字体大小:', size)

    // 直接通过 setData 更新 currentSize，WXML 会自动应用
    wx.setStorageSync('chatFontSize', size)
    console.log('字体大小已保存到本地存储:', size)
  },

  onComplete() {
    console.log('=== 点击完成按钮 ===')
    console.log('当前数据:', this.data)

    // 保存设置并关闭页面
    const { currentSize } = this.data
    console.log('保存字体大小:', currentSize)

    wx.setStorageSync('chatFontSize', currentSize)
    console.log('字体大小已保存，准备退出')

    wx.navigateBack()
    console.log('已调用 navigateBack')
  },

  onClose() {
    console.log('=== 点击返回按钮 ===')
    wx.navigateBack()
    console.log('已调用 navigateBack')
  },

  onShow() {
    console.log('=== 页面显示 ===')
  },

  onReady() {
    console.log('=== 页面渲染完成 ===')
    console.log('当前数据:', this.data)
  }
})