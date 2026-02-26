# Step 9：数据库配置指南

## 需要创建的数据库集合

### 1. friends集合（好友关系表）

用于存储用户之间的好友关系。

#### 字段说明
| 字段名 | 类型 | 说明 |
|--------|------|------|
| _id | String | 自动生成的主键 |
| myUserID | String | 我的用户ID |
| friendUserID | String | 好友的用户ID |
| friendNickName | String | 好友昵称 |
| friendAvatar | String | 好友头像 |
| createTime | Date | 创建时间 |

#### 示例数据
```json
{
  "_id": "auto_generated_id",
  "myUserID": "wx_user_001",
  "friendUserID": "wx_user_002",
  "friendNickName": "张三",
  "friendAvatar": "https://...",
  "createTime": "2026-02-23T07:00:00.000Z"
}
```

### 2. users集合（用户信息表）

已存在，用于存储用户基本信息。

## 数据库权限配置

### 方式1：在云开发控制台配置（推荐）

1. 打开云开发控制台：https://console.cloud.tencent.com/tcb
2. 进入你的环境：cloud1-9g55gy2x541c7f64
3. 点击 **数据库**
4. 点击 **+** 创建集合，输入名称：`friends`
5. 点击 **数据库权限** 标签
6. 找到 `friends` 集合
7. 修改权限为：
   - **读权限**：所有用户可读
   - **写权限**：仅创建者可写

### 方式2：使用JSON配置

在项目根目录创建 `cloudbase.json` 文件：

```json
{
  "database": {
    "collections": [
      {
        "name": "friends",
        "description": "好友关系表",
        "permissions": {
          "read": true,
          "write": "doc._openid == auth.openid"
        }
      },
      {
        "name": "users",
        "description": "用户信息表",
        "permissions": {
          "read": true,
          "write": "doc._openid == auth.openid"
        }
      }
    ]
  }
}
```

## 权限规则说明

### friends集合
- **读取**：所有用户可以读取
- **写入**：只能写入自己创建的记录（通过myUserID和openid匹配）

### users集合
- **读取**：所有用户可以读取（方便查看其他用户信息）
- **写入**：只能写入自己的记录

## 索引配置（可选）

为了提高查询性能，可以添加索引：

### friends集合索引
```json
{
  "collection": "friends",
  "indexes": [
    {
      "name": "index_myUserID",
      "keys": [
        {"name": "myUserID", "order": "asc"}
      ]
    },
    {
      "name": "index_friendUserID",
      "keys": [
        {"name": "friendUserID", "order": "asc"}
      ]
    }
  ]
}
```

### users集合索引
```json
{
  "collection": "users",
  "indexes": [
    {
      "name": "index_university",
      "keys": [
        {"name": "university", "order": "asc"}
      ]
    }
  ]
}
```

## 数据库初始化检查

### 检查1：集合是否存在
在云开发控制台查看是否已创建：
- ✅ users - 应该已经存在
- ⏳ friends - 需要创建

### 检查2：权限是否正确
在云开发控制台 -> 数据库权限查看：
- friends读权限：✓
- friends写权限：✓ 仅创建者

### 检查3：测试写入
在微信开发者工具控制台执行：
```javascript
const db = wx.cloud.database();
db.collection('friends').add({
  data: {
    myUserID: 'test_user',
    friendUserID: 'test_friend',
    friendNickName: '测试好友',
    friendAvatar: '/image/other_head.jpg',
    createTime: new Date()
  },
  success: res => console.log('添加成功', res),
  fail: err => console.error('添加失败', err)
});
```

如果成功，说明权限配置正确。

## 常见问题

### Q1: 添加好友失败，权限错误？
A: 检查：
1. friends集合是否已创建
2. 写权限是否设置为"仅创建者"
3. 是否正确调用wx.cloud.database()

### Q2: 查询不到好友列表？
A: 检查：
1. 查询条件是否正确
2. myUserID是否匹配
3. 读权限是否正确

### Q3: 双向好友关系问题？
A: 我们在代码中已经处理：
- 添加好友时，创建两条记录（A->B 和 B->A）
- 删除好友时，删除两条记录

---

**下一步：测试好友列表功能**
