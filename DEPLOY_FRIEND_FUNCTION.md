# 部署 friendOperation 云函数指南

## 问题说明

用户在真机调试时，点击"添加好友"失败，控制台报错：
```
errCode: -502003 database permission denied | errMsg: Permission denied
```

这是数据库权限问题，解决方案是使用云函数来操作数据库，绕过小程序端的权限限制。

## 部署步骤

### 方法1：使用微信开发者工具部署（推荐）

1. **打开微信开发者工具**
   - 打开当前项目

2. **进入云函数目录**
   - 在左侧项目结构中，找到 `cloudfunctions` 目录
   - 你会看到 `friendOperation` 文件夹

3. **右键点击 friendOperation 文件夹**
   - 选择"上传并部署：云端安装依赖"
   - 等待上传和部署完成

4. **确认部署成功**
   - 部署成功后，`friendOperation` 文件夹会显示一个云图标
   - 右键 → "查看日志"，应该没有错误

### 方法2：使用命令行部署

```bash
# 进入云函数目录
cd cloudfunctions/friendOperation

# 安装依赖
npm install

# 返回项目根目录
cd ../..

# 部署云函数
wx-server-cli deploy friendOperation
```

## 云函数功能

`friendOperation` 云函数提供以下操作：

### 1. 添加好友（action: 'add'）
- 创建双向好友关系
- 参数：
  - `myUserID`: 我的用户ID
  - `friendUserID`: 好友的用户ID
  - `friendNickName`: 好友昵称
  - `friendAvatar`: 好友头像

### 2. 删除好友（action: 'delete'）
- 删除双向好友关系
- 参数：
  - `myUserID`: 我的用户ID
  - `friendUserID`: 好友的用户ID

### 3. 获取好友列表（action: 'getFriends'）
- 获取当前用户的好友列表
- 参数：
  - `myUserID`: 我的用户ID

## 验证部署

### 测试云函数是否正常工作

1. **打开云开发控制台**
   - 点击"云开发" → "云开发控制台"
   - 选择"云函数" → "friendOperation"

2. **测试云函数**
   - 点击"测试"按钮
   - 输入测试数据：

   **测试添加好友：**
   ```json
   {
     "action": "add",
     "myUserID": "test_user_1",
     "friendUserID": "test_user_2",
     "friendNickName": "测试用户",
     "friendAvatar": "https://example.com/avatar.jpg"
   }
   ```

   **测试获取好友列表：**
   ```json
   {
     "action": "getFriends",
     "myUserID": "test_user_1"
   }
   ```

   **测试删除好友：**
   ```json
   {
     "action": "delete",
     "myUserID": "test_user_1",
     "friendUserID": "test_user_2"
   }
   ```

3. **查看返回结果**
   - 成功的返回：
   ```json
   {
     "code": 0,
     "message": "添加成功"
   }
   ```
   或
   ```json
   {
     "code": 0,
     "data": [...]
   }
   ```

### 真机测试

1. **部署完成后，重新编译小程序**
   - 点击"编译"按钮
   - 或按 `Ctrl + B`（Windows）/ `Cmd + B`（Mac）

2. **真机调试**
   - 使用两台手机登录
   - 在其中一台手机上搜索并添加另一台手机为好友
   - 应该显示"添加成功"

## 常见问题

### 问题1：部署失败

**可能原因：**
- 网络连接问题
- 云函数代码有语法错误
- 依赖安装失败

**解决方案：**
```
1. 检查网络连接
2. 查看部署日志，确认错误原因
3. 删除云函数后重新部署
```

### 问题2：云函数调用失败

**可能原因：**
- 云函数未部署成功
- 云函数名称不正确
- 环境ID不正确

**解决方案：**
```
1. 确认云函数已部署成功
2. 检查云函数名称是否为 "friendOperation"
3. 检查云开发环境是否正确
```

### 问题3：添加好友仍然失败

**可能原因：**
- 云函数逻辑错误
- 数据库操作失败
- 用户ID不正确

**解决方案：**
```
1. 查看云函数日志
2. 检查数据库数据
3. 确认用户ID正确
```

## 云函数日志查看

### 在微信开发者工具中查看

1. 点击"云开发" → "云开发控制台"
2. 选择"云函数" → "friendOperation"
3. 点击"日志"标签
4. 查看最近的日志输出

### 常见日志

**成功日志：**
```
friendOperation云函数被调用 { action: 'add', myUserID: 'xxx', ... }
```

**失败日志：**
```
friendOperation云函数执行失败 Error: ...
```

## 数据库权限配置

虽然使用了云函数，但仍需要配置基本的数据库权限：

### users 集合
```json
{
  "read": true,
  "write": "doc._openid == auth.openid"
}
```

### friends 集合
```json
{
  "read": true,
  "write": true
}
```

或者使用简化配置：
- `users`: 所有用户可读，仅创建者可写
- `friends`: 所有用户可读写

## 后续优化建议

1. **添加好友验证**
   - 添加好友前发送申请
   - 对方确认后才建立好友关系

2. **添加分组功能**
   - 好友分组管理
   - 按分组查看好友

3. **添加黑名单功能**
   - 屏蔽特定用户
   - 防止被骚扰

4. **添加好友推荐**
   - 基于共同兴趣推荐好友
   - 基于地理位置推荐好友
