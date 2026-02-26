# 修复npm包导入错误

## 📋 问题说明
错误信息：`module 'libs/im-sdk/sdk/tim-js-sdk.js' is not defined`

原因：微信小程序需要先「构建npm」才能使用npm包。

## 🔧 完整解决步骤

### Step 1：安装正确的SDK（微信小程序版本）

在终端执行以下命令：
```bash
npm uninstall tim-js-sdk
npm install --save tim-wx-sdk
```

> **说明**：`tim-wx-sdk` 是专门为微信小程序优化的TIM SDK版本

### Step 2：构建npm（必须步骤）

在微信开发者工具中：
1. 点击顶部菜单「工具」
2. 选择「构建npm」
3. 等待构建完成（约10-30秒）
4. 看到「构建npm成功」提示

### Step 3：验证构建结果

构建成功后，会在项目中生成以下文件：
```
wechat-im/
├── miniprogram_npm/          # 新增目录
│   └── tim-wx-sdk/           # TIM SDK构建产物
│       ├── index.js
│       ├── tim-wx.js
│       └── ...
├── package.json
└── ...
```

### Step 4：重新编译

1. 点击「编译」按钮
2. 查看控制台，应该不再报错

---

## ⚠️ 常见问题

### Q：构建npm失败？
A：检查以下几点：
1. 确保package.json中已安装依赖
2. 确保项目目录下没有node_modules被.gitignore忽略
3. 尝试删除miniprogram_npm目录后重新构建

### Q：构建成功但仍然报错？
A：
1. 关闭微信开发者工具
2. 删除 `miniprogram_npm` 目录
3. 重新打开项目
4. 重新执行「构建npm」

### Q：提示找不到tim-wx-sdk？
A：
1. 检查node_modules中是否有tim-wx-sdk
2. 检查miniprogram_npm中是否有tim-wx-sdk
3. 确认tim-handler-imp.js中import语句正确

---

## ✅ 完成后验证

构建完成后，重新编译，控制台应该显示：
```
初始化TIM，SDKAppID: 1600125415
```

如果还看到错误，请将完整的错误信息发给我。
