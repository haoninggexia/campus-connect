# 重新部署云函数（不依赖外部库版本）

## 问题说明
之前的云函数需要安装 `tls-sig-api-v2` 外部依赖，导致部署失败。现在使用腾讯云官方库的**源码直接集成**到云函数中，不需要任何额外依赖。

## 云函数改动

### 改动1：简化 package.json
移除了 `tls-sig-api-v2` 依赖，只保留 `wx-server-sdk`：

```json
{
  "name": "getUserSig",
  "version": "1.0.0",
  "description": "生成腾讯云IM UserSig的云函数",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  },
  "author": "",
  "license": "ISC"
}
```

### 改动2：集成官方库源码
将腾讯云官方 UserSig 生成库的源码直接集成到 `index.js` 中，包括：
- `crypto` 加密模块
- `zlib` 压缩模块
- 官方 HMAC-SHA256 算法实现
- 官方压缩和编码逻辑

## 部署步骤

### 步骤1：重新部署云函数

1. 在微信开发者工具中，右键点击 `cloudfunctions/getUserSig` 文件夹
2. 选择 **上传并部署：云端安装依赖**
3. 等待部署完成（应该很快，因为没有额外依赖）

### 步骤2：清除缓存并重新登录

1. 在微信开发者工具中：清除缓存 -> 清除全部缓存
2. 删除手机上的小程序
3. 重新编译
4. 重新登录

### 步骤3：本地测试验证（可选）

在终端运行：

```bash
cd d:\原C盘\桌面\wechat-im
node test-usersig-official.js test_user_001
```

然后在腾讯云IM控制台对比生成的UserSig：
- 控制台地址：https://console.cloud.tencent.com/im
- 进入应用 -> 开发辅助工具 -> UserSig生成校验
- 输入相同的UserID: `test_user_001`
- 对比控制台生成的UserSig

**使用官方库源码后，两者应该完全相同！**

## 预期结果

### 云函数返回
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "userID": "wx_xxx_xxx",
    "userSig": "eJx...",
    "SDKAppID": 1600125415
  }
}
```

### TIM控制台日志
```
TIM SDK准备就绪
TIM登录成功 wx_xxx_xxx
```

## 如果仍然失败

### 检查1：云函数部署是否成功
查看云函数日志，应该看到：
```
[DEBUG] 生成UserSig，userID: wx_xxx_xxx
[DEBUG] UserSig生成成功，有效期: 15552000 秒
[DEBUG] UserSig长度: xxx
```

### 检查2：查看详细错误
如果TIM登录仍然失败，在控制台中查看错误详情：
- 错误码
- 错误信息

### 检查3：云函数日志
1. 打开云开发控制台
2. 进入 **云函数** 标签
3. 找到 `getUserSig` 云函数
4. 点击 **日志**
5. 查看是否有 `[ERROR]` 开头的日志

## 优势

使用官方库源码的优点：
1. ✅ 不需要安装外部依赖，部署更快
2. ✅ 算法与腾讯云控制台完全一致
3. ✅ 代码可审计，安全性有保障
4. ✅ 支持UserSig压缩，更短更高效

## 联系我

如果按照以上步骤操作后仍然失败，请提供：
1. 云函数日志（特别是 `[DEBUG]` 和 `[ERROR]` 开头的行）
2. TIM SDK控制台的错误详情
3. 本地测试脚本生成的UserSig
4. 腾讯云控制台生成的UserSig

我会进一步帮你分析问题！
