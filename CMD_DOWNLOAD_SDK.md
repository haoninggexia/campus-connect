# 下载TIM SDK并手动配置

## 🎯 最简单可靠的解决方案

由于npm构建存在兼容性问题，我们采用**手动下载+本地引入**的方式。

---

## 📥 Step 1：下载TIM SDK

### 方法1：从GitHub下载（推荐）
1. 访问：https://github.com/tencentyun/TIMSDK/releases
2. 找到最新版本（如：2.27.6）
3. 下载 `TIMSDK.WX.miniapp.zip`
4. 解压后找到 `lib/tim-wx.js` 文件

### 方法2：从腾讯云官网下载
1. 访问：https://cloud.tencent.com/document/product/269/68443
2. 找到"微信小程序SDK"下载链接
3. 下载并解压
4. 找到 `tim-wx.js` 文件

---

## 📁 Step 2：放置文件

将下载的 `tim-wx.js` 文件复制到项目根目录：

```
wechat-im/
├── tim-wx.js          ← 新增文件
├── app.js
├── app.json
├── ...
```

---

## 📝 Step 3：修改导入语句

修改 `libs/im-sdk/sdk/tim-handler-imp.js` 文件：

```javascript
import IIMHandler from "../interface/i-im-handler";
// 使用本地下载的SDK
import TIM from '../../tim-wx.js';

export default class TIMHandlerImp extends IIMHandler {
    // ...
}
```

---

## 🗑️ Step 4：清理npm相关文件

删除以下文件/文件夹：
- `miniprogram_npm/` 文件夹
- `node_modules/tim-wx-sdk/` 文件夹（可选）

---

## ✅ Step 5：验证

1. 点击「编译」按钮
2. 查看控制台，应该不再报错
3. 测试登录功能

---

## ⚠️ 注意事项

1. **SDK版本**：确保下载的是微信小程序版本（WX.miniapp）
2. **文件位置**：tim-wx.js必须放在项目根目录
3. **导入路径**：根据tim-wx.js的实际位置调整导入语句

---

## 🆘 下载帮助

如果无法下载，可以：
1. 在GitHub Releases页面搜索 "TIMSDK"
2. 或联系腾讯云技术支持
3. 或告诉我，我帮你找其他下载源

---

**下载完成后，告诉我，我帮你继续！** 🚀
