// pages/my-profile/my-profile.js
const app = getApp()

Page({
  data: {
    userInfo: {},
    selectedPhotos: [],
    tempAvatar: null,
    bioLength: 0,
    tempAvatarUrl: null, // 缓存头像临时链接
    tempPhotoUrls: [] // 缓存照片临时链接
  },

  /**
   * 获取照片显示URL
   * 如果是临时文件（wxfile://），直接返回
   * 如果有临时链接，返回临时链接
   * 否则返回原始路径
   */
  getPhotoUrl(originalUrl, tempUrl) {
    if (!originalUrl) return '';
    // 如果是本地临时文件，直接使用
    if (originalUrl.startsWith('wxfile://')) {
      return originalUrl;
    }
    // 如果是云文件，返回云文件URL
    if (originalUrl.startsWith('cloud://')) {
      return originalUrl;
    }
    // 否则优先使用临时链接
    return tempUrl || originalUrl;
  },

  onLoad() {
    // 获取当前用户信息
    const userInfo = wx.getStorageSync('user_info') || {};

    // 获取用户扩展信息
    this.loadUserProfile();

    this.setData({
      userInfo: userInfo
    });

    console.log('当前用户信息', userInfo);
  },

  /**
   * 加载用户扩展信息（头像、照片、简介）
   */
  async loadUserProfile() {
    try {
      console.log('开始加载用户资料，userID:', this.data.userInfo.userID);
      
      // 直接从数据库读取，不依赖云函数
      const dbRes = await wx.cloud.database().collection('users_profile')
        .where({
          userID: this.data.userInfo.userID
        })
        .get();

      if (dbRes.data && dbRes.data.length > 0) {
        const profile = dbRes.data[0];
        
        console.log('从数据库读取到用户资料:', profile);
        console.log('照片数据:', profile.photos);
        
        // 检查照片数据
        if (profile.photos) {
          console.log('照片数组长度:', profile.photos.length);
          profile.photos.forEach((photo, index) => {
            console.log(`照片${index}:`, photo);
          });
        }
        
        this.setData({
          selectedPhotos: profile.photos || [],
          'userInfo.customAvatar': profile.customAvatar,
          'userInfo.bio': profile.bio,
          'userInfo.nickName': profile.nickName || this.data.userInfo.nickName, // 加载昵称
          bioLength: (profile.bio || '').length
        });
        
        console.log('用户资料设置完成');
      } else {
        console.log('数据库中未找到用户资料');
        // 初始化空数组
        this.setData({
          selectedPhotos: [],
          'userInfo.customAvatar': null,
          'userInfo.bio': '',
          bioLength: 0
        });
      }
    } catch (e) {
      console.error('加载用户资料失败', e);
      // 初始化空数组
      this.setData({
        selectedPhotos: [],
        'userInfo.customAvatar': null,
        'userInfo.bio': '',
        bioLength: 0
      });
    }
  },

  /**
   * 选择头像
   */
  onChooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFile = res.tempFiles[0].tempFilePath;
        this.setData({
          tempAvatar: tempFile,
          'userInfo.customAvatar': tempFile,
          tempAvatarUrl: null // 清空临时链接
        });
      }
    });
  },

  /**
   * 选择照片
   */
  onChoosePhoto(e) {
    const index = e.currentTarget.dataset.index;
    const currentPhotos = this.data.selectedPhotos;

    if (currentPhotos[index]) {
      return; // 已经有照片了
    }

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newPhotos = [...currentPhotos];
        const newTempUrls = [...this.data.tempPhotoUrls];
        newPhotos[index] = res.tempFiles[0].tempFilePath;
        newTempUrls[index] = null; // 清空临时链接，使用本地文件
        this.setData({
          selectedPhotos: newPhotos,
          tempPhotoUrls: newTempUrls
        });
      }
    });
  },

  /**
   * 删除照片
   */
  onDeletePhoto(e) {
    const index = e.currentTarget.dataset.index;
    const newPhotos = [...this.data.selectedPhotos];
    const newTempUrls = [...this.data.tempPhotoUrls];
    newPhotos[index] = '';
    newTempUrls[index] = null;
    this.setData({
      selectedPhotos: newPhotos,
      tempPhotoUrls: newTempUrls
    });
  },

  /**
   * 预览照片
   */
  onPreviewPhoto(e) {
    const index = e.currentTarget.dataset.index;
    const photoUrl = this.data.selectedPhotos[index];
    
    if (!photoUrl) return;
    
    // 获取所有已上传的照片URL
    const photoUrls = this.data.selectedPhotos.filter(url => url && url.trim() !== '');
    
    if (photoUrls.length === 0) return;
    
    wx.previewImage({
      current: photoUrl, // 当前显示图片的http链接
      urls: photoUrls // 需要预览的图片http链接列表
    });
  },

  /**
   * 简介输入
   */
  onBioInput(e) {
    const bio = e.detail.value;
    this.setData({
      'userInfo.bio': bio,
      bioLength: bio.length
    });
  },

  /**
   * 昵称输入
   */
  onNicknameInput(e) {
    const nickname = e.detail.value;
    this.setData({
      'userInfo.nickName': nickname
    });
  },

  /**
   * 上传文件到云存储
   */
  uploadFile(filePath) {
    return new Promise((resolve, reject) => {
      const cloudPath = `user_photos/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
      
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath,
        success: (res) => {
          resolve(res.fileID);
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  /**
   * 保存个人信息
   */
  async onSaveProfile() {
    wx.showLoading({ title: '保存中...' });

    try {
      const userInfo = this.data.userInfo;
      const db = wx.cloud.database();

      // 更新简介长度
      this.setData({
        bioLength: (userInfo.bio || '').length
      });

      // 上传头像
      let customAvatar = userInfo.customAvatar;
      if (customAvatar && !customAvatar.startsWith('cloud://')) {
        customAvatar = await this.uploadFile(customAvatar);
      }

      // 上传照片
      const uploadedPhotos = [];
      for (let i = 0; i < this.data.selectedPhotos.length; i++) {
        const photo = this.data.selectedPhotos[i];
        if (photo && !photo.startsWith('cloud://')) {
          const uploaded = await this.uploadFile(photo);
          uploadedPhotos[i] = uploaded;
        } else {
          uploadedPhotos[i] = photo;
        }
      }

      console.log('准备保存照片数据:', uploadedPhotos);

      // 保存到数据库
      const res = await db.collection('users_profile')
        .where({
          userID: userInfo.userID
        })
        .get();

      const profileData = {
        userID: userInfo.userID,
        nickName: userInfo.nickName, // 保存昵称
        customAvatar: customAvatar,
        photos: uploadedPhotos,
        bio: userInfo.bio || '',
        updateTime: new Date()
      };

      if (res.data && res.data.length > 0) {
        // 更新
        await db.collection('users_profile')
          .doc(res.data[0]._id)
          .update({
            data: profileData
          });
      } else {
        // 新增
        await db.collection('users_profile')
          .add({
            data: profileData
          });
      }

      // 更新本地存储
      const storedUserInfo = wx.getStorageSync('user_info') || {};
      storedUserInfo.customAvatar = customAvatar;
      storedUserInfo.bio = userInfo.bio;
      storedUserInfo.nickName = userInfo.nickName; // 更新本地存储的昵称
      wx.setStorageSync('user_info', storedUserInfo);

      this.setData({
        'userInfo.customAvatar': customAvatar
      });

      wx.hideLoading();
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });

      // 清空临时文件
      this.setData({
        tempAvatar: null
      });

      // 重新加载资料，获取新的临时链接
      setTimeout(() => {
        this.loadUserProfile();
      }, 500);
    } catch (e) {
      wx.hideLoading();
      console.error('保存失败', e);
      wx.showToast({
        title: '保存失败，请重试',
        icon: 'none'
      });
    }
  },

  /**
   * 复制用户ID
   */
  onCopyUserID() {
    const userID = this.data.userInfo.userID;

    if (!userID) {
      wx.showToast({
        title: '用户ID不存在',
        icon: 'none'
      });
      return;
    }

    wx.setClipboardData({
      data: userID,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        });
      },
      fail: () => {
        wx.showToast({
          title: '复制失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 分享给好友
   */
  onShare() {
    const userInfo = this.data.userInfo;

    // 显示用户信息，方便分享
    wx.showModal({
      title: '分享我的信息',
      content: `昵称：${userInfo.nickName}\n用户ID：${userInfo.userID}\n大学：${userInfo.university}\n专业：${userInfo.major}\n\n截图或复制后分享给好友`,
      confirmText: '复制全部',
      cancelText: '关闭',
      success: (res) => {
        if (res.confirm) {
          const shareText = `【我的信息】\n昵称：${userInfo.nickName}\n用户ID：${userInfo.userID}\n大学：${userInfo.university}\n专业：${userInfo.major}`;

          wx.setClipboardData({
            data: shareText,
            success: () => {
              wx.showToast({
                title: '已复制到剪贴板',
                icon: 'success'
              });
            }
          });
        }
      }
    });
  },

  /**
   * 清除数据
   */
  onClearData() {
    wx.showModal({
      title: '清除数据',
      content: '确定要清除所有本地数据吗？',
      success: (res) => {
        if (res.confirm) {
          // 清除本地存储
          wx.clearStorageSync();

          wx.showToast({
            title: '数据已清除',
            icon: 'success'
          });

          // 跳转到登录页
          setTimeout(() => {
            wx.reLaunch({
              url: '/pages/auth/auth'
            });
          }, 1000);
        }
      }
    });
  },

  /**
   * 退出登录
   */
  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 退出TIM登录
          if (app.appIMDelegate && app.appIMDelegate.imHandler) {
            app.appIMDelegate.imHandler.closeConnection();
          }

          // 清除用户信息缓存
          wx.removeStorageSync('user_info');
          wx.removeStorageSync('user_sig');

          wx.showToast({
            title: '已退出登录',
            icon: 'success'
          });

          // 跳转到登录页
          setTimeout(() => {
            wx.reLaunch({
              url: '/pages/auth/auth'
            });
          }, 500);
        }
      }
    });
  }
});
