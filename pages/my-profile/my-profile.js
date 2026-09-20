// pages/my-profile/my-profile.js
const app = getApp()

Page({
  data: {
    userInfo: {},
    selectedPhotos: [],
    tempAvatar: null,
    bioLength: 0,
    tempAvatarUrl: null, // 缓存头像临时链接
    tempPhotoUrls: [], // 缓存照片临时链接
    savedPhotos: [], // 已保存到云存储的照片 cloud:// 路径
    savedCustomAvatar: null, // 已保存到云存储的头像 cloud:// 路径
    gradeOptions: ['2015级', '2016级', '2017级', '2018级', '2019级', '2020级', '2021级', '2022级', '2023级', '2024级', '2025级', '2026级', '2027级'], // 年级选项
    genderOptions: ['男', '女'], // 性别选项
    genderLocked: false // 性别是否已锁定（选定后不可修改）
  },

  // 自动保存相关
  _saveTimer: null,
  _saving: false,
  _pendingSave: false,

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

  /**
   * 检查登录状态，未登录则跳转到登录页
   */
  checkLogin() {
    const userInfo = wx.getStorageSync('user_info') || {};
    if (!userInfo.userID) {
      wx.reLaunch({
        url: '/pages/auth/auth'
      });
      return false;
    }
    return true;
  },

  onShow() {
    // 更新自定义tabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  onLoad() {
    // 检查登录状态，未登录则跳转到登录页
    if (!this.checkLogin()) return;

    // 获取当前用户信息
    const userInfo = wx.getStorageSync('user_info') || {};

    // 先设置 userInfo，再加载扩展资料（否则 this.data.userInfo.userID 为 undefined）
    this.setData({
      userInfo: userInfo
    });

    console.log('当前用户信息', userInfo);

    // 获取用户扩展信息
    this.loadUserProfile();
  },

  /**
   * 加载用户扩展信息（头像、照片、简介）
   */
  async loadUserProfile() {
    try {
      console.log('开始加载用户资料，userID:', this.data.userInfo.userID);

      // 调用云函数获取临时下载链接
      const res = await wx.cloud.callFunction({
        name: 'getUserProfile',
        data: {
          userID: this.data.userInfo.userID
        }
      });

      if (res.result.code === 0) {
        const profile = res.result.data;

        console.log('从云函数获取到用户资料:', profile);
        console.log('临时头像链接:', profile.customAvatarTemp);
        console.log('临时照片链接:', profile.photosTemp);

        // 使用临时下载链接显示；同时保留原始 cloud:// 路径，
        // 供保存时区分"本地新文件（需上传）"和"云端已有文件（直接保留）"
        this.setData({
          selectedPhotos: profile.photosTemp || [],
          savedPhotos: profile.photos || [],
          'userInfo.customAvatar': profile.customAvatarTemp || profile.customAvatar,
          savedCustomAvatar: profile.customAvatar,
          'userInfo.bio': profile.bio,
          'userInfo.nickName': profile.nickName || this.data.userInfo.nickName,
          'userInfo.grade': profile.grade || '',
          'userInfo.gender': profile.gender || '',
          genderLocked: !!profile.gender,
          bioLength: (profile.bio || '').length
        });

        console.log('用户资料设置完成，照片数量:', profile.photosTemp ? profile.photosTemp.length : 0);
      } else {
        console.log('云函数返回错误:', res.result.msg);
        // 备用方案：直接从数据库读取
        await this.loadUserProfileFromDB();
      }
    } catch (e) {
      console.error('调用云函数失败:', e);
      // 备用方案：直接从数据库读取
      await this.loadUserProfileFromDB();
    }
  },

  /**
   * 备用方案：直接从数据库读取用户资料
   */
  async loadUserProfileFromDB() {
    try {
      console.log('使用备用方案，从数据库读取用户资料');

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

        // 过滤掉空值，确保照片数组是紧凑的
        const compactPhotos = (profile.photos || []).filter(p => p && typeof p === 'string' && p.trim() !== '');

        this.setData({
          selectedPhotos: compactPhotos,
          savedPhotos: compactPhotos,
          'userInfo.customAvatar': profile.customAvatar,
          savedCustomAvatar: profile.customAvatar,
          'userInfo.bio': profile.bio,
          'userInfo.nickName': profile.nickName || this.data.userInfo.nickName,
          'userInfo.grade': profile.grade || '',
          'userInfo.gender': profile.gender || '',
          genderLocked: !!profile.gender,
          bioLength: (profile.bio || '').length
        });

        console.log('用户资料设置完成（使用数据库数据），照片数:', compactPhotos.length);
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
    // 添加加载反馈，避免"点了没反应"的感觉
    wx.showLoading({ title: '正在打开...', mask: true });

    const chooseSuccess = (res) => {
      wx.hideLoading();
      const tempFile = res.tempFiles[0].tempFilePath;
      this.setData({
        tempAvatar: tempFile,
        'userInfo.customAvatar': tempFile,
        tempAvatarUrl: null // 清空临时链接
      });
      this._autoSave(true);
    };

    const chooseFail = (err) => {
      wx.hideLoading();
      console.error('选择头像失败:', err);
      // 用户主动取消选择，静默处理，不弹错误提示
      if (err && err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
        return;
      }
      // 关键：给用户明确的反馈，而不是无响应
      wx.showToast({
        title: '打开相册失败，请检查权限',
        icon: 'none',
        duration: 2000
      });
    };

    // 优先使用 chooseMedia，如果不可用则回退到 chooseImage
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: chooseSuccess,
        fail: chooseFail
      });
    } else {
      wx.chooseImage({
        count: 1,
        sourceType: ['album', 'camera'],
        success: (res) => {
          wx.hideLoading();
          const tempFile = res.tempFilePaths[0];
          this.setData({
            tempAvatar: tempFile,
            'userInfo.customAvatar': tempFile,
            tempAvatarUrl: null // 清空临时链接
          });
          this._autoSave(true);
        },
        fail: chooseFail
      });
    }
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

    // 添加加载反馈，避免"点了没反应"的感觉
    wx.showLoading({ title: '正在打开...', mask: true });

    const chooseSuccess = (res) => {
      wx.hideLoading();
      const newPhotos = [...currentPhotos];
      const newTempUrls = [...this.data.tempPhotoUrls];
      newPhotos[index] = res.tempFiles[0].tempFilePath;
      newTempUrls[index] = null; // 清空临时链接，使用本地文件
      this.setData({
        selectedPhotos: newPhotos,
        tempPhotoUrls: newTempUrls
      });
      this._autoSave(true);
    };

    const chooseFail = (err) => {
      wx.hideLoading();
      console.error('选择照片失败:', err);
      // 用户主动取消选择，静默处理，不弹错误提示
      if (err && err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
        return;
      }
      wx.showToast({
        title: '打开相册失败，请检查权限',
        icon: 'none',
        duration: 2000
      });
    };

    // 优先使用 chooseMedia，如果不可用则回退到 chooseImage
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: chooseSuccess,
        fail: chooseFail
      });
    } else {
      wx.chooseImage({
        count: 1,
        sourceType: ['album', 'camera'],
        success: (res) => {
          wx.hideLoading();
          const newPhotos = [...currentPhotos];
          const newTempUrls = [...this.data.tempPhotoUrls];
          newPhotos[index] = res.tempFilePaths[0];
          newTempUrls[index] = null; // 清空临时链接，使用本地文件
          this.setData({
            selectedPhotos: newPhotos,
            tempPhotoUrls: newTempUrls
          });
          this._autoSave(true);
        },
        fail: chooseFail
      });
    }
  },

  /**
   * 删除照片
   */
  onDeletePhoto(e) {
    const index = e.currentTarget.dataset.index;
    const newPhotos = [...this.data.selectedPhotos];
    const newTempUrls = [...this.data.tempPhotoUrls];
    const newSavedPhotos = [...this.data.savedPhotos];
    newPhotos[index] = '';
    newTempUrls[index] = null;
    newSavedPhotos[index] = '';
    this.setData({
      selectedPhotos: newPhotos,
      tempPhotoUrls: newTempUrls,
      savedPhotos: newSavedPhotos
    });
    this._autoSave(true);
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
    this._autoSave();
  },

  /**
   * 昵称输入
   */
  onNicknameInput(e) {
    const nickname = e.detail.value;
    this.setData({
      'userInfo.nickName': nickname
    });
    this._autoSave();
  },

  /**
   * 性别选择
   */
  onGenderChange(e) {
    // 已锁定则禁止修改
    if (this.data.genderLocked) {
      wx.showToast({
        title: '性别选定后不可修改',
        icon: 'none'
      });
      return;
    }

    const index = e.detail.value;
    const gender = this.data.genderOptions[index];
    this.setData({
      'userInfo.gender': gender,
      genderLocked: true // 选定后立即锁定，避免保存期间被再次修改
    });
    this._autoSave(true);
  },

  /**
   * 年级选择
   */
  onGradeChange(e) {
    const index = e.detail.value;
    const grade = this.data.gradeOptions[index];
    this.setData({
      'userInfo.grade': grade
    });
    this._autoSave(true);
  },

  /**
   * 判断是否为本地临时文件（需要上传到云存储）
   * 开发者工具中 chooseMedia 返回 http://tmp/...，真机返回 wxfile://tmp_...
   * https:// 临时下载链接、cloud:// 云文件路径都不是本地文件，不能传给 wx.cloud.uploadFile
   */
  _isLocalTempFile(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    return filePath.startsWith('wxfile://') || filePath.startsWith('http://tmp/');
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
   * 自动保存（带防抖）
   * @param {boolean} immediate - 是否立即保存（图片/选择类操作），否则延迟800ms防抖
   */
  _autoSave(immediate = false) {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
    }
    if (immediate) {
      if (this._saving) {
        this._pendingSave = true;
      } else {
        this.onSaveProfile(false);
      }
    } else {
      this._saveTimer = setTimeout(() => {
        this.onSaveProfile(false);
      }, 800);
    }
  },

  /**
   * 保存个人信息
   * @param {boolean} showToast - 是否显示保存提示，自动保存时为false
   */
  async onSaveProfile(showToast = true) {
    // 防止并发保存
    if (this._saving) return;
    this._saving = true;

    if (showToast) {
      wx.showLoading({ title: '保存中...' });
    }

    try {
      const userInfo = this.data.userInfo;
      const db = wx.cloud.database();

      // 更新简介长度
      this.setData({
        bioLength: (userInfo.bio || '').length
      });

      // 上传头像：仅本地新选择的文件需要上传
      let customAvatar = userInfo.customAvatar;
      if (this._isLocalTempFile(customAvatar)) {
        customAvatar = await this.uploadFile(customAvatar);
      } else if (customAvatar && !customAvatar.startsWith('cloud://')) {
        // 显示的是临时下载链接（https://）等非本地文件，回退到已保存的 cloud:// 路径
        customAvatar = this.data.savedCustomAvatar || customAvatar;
      }

      // 上传照片：仅本地新选择的文件需要上传
      const uploadedPhotos = [];
      for (let i = 0; i < this.data.selectedPhotos.length; i++) {
        const photo = this.data.selectedPhotos[i];
        if (this._isLocalTempFile(photo)) {
          // 本地新选的照片，上传到云存储
          uploadedPhotos[i] = await this.uploadFile(photo);
        } else if (photo && photo.startsWith('cloud://')) {
          // 已是云文件，直接使用
          uploadedPhotos[i] = photo;
        } else if (this.data.savedPhotos[i]) {
          // 显示的是临时下载链接，回退到已保存的 cloud:// 路径
          uploadedPhotos[i] = this.data.savedPhotos[i];
        } else {
          // 空值或无效值，置空（保存时会被过滤）
          uploadedPhotos[i] = '';
        }
      }

      console.log('准备保存照片数据:', uploadedPhotos);

      // 保存到数据库
      const res = await db.collection('users_profile')
        .where({
          userID: userInfo.userID
        })
        .get();

      // 过滤掉空值，确保存到数据库的photos数组是紧凑的
      const compactPhotos = uploadedPhotos.filter(p => p && typeof p === 'string' && p.trim() !== '');

      const profileData = {
        userID: userInfo.userID,
        nickName: userInfo.nickName, // 保存昵称
        customAvatar: customAvatar,
        photos: compactPhotos,
        bio: userInfo.bio || '',
        grade: userInfo.grade || '', // 保存年级
        gender: userInfo.gender || '', // 保存性别
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
      storedUserInfo.grade = userInfo.grade || ''; // 更新本地存储的年级
      storedUserInfo.gender = userInfo.gender || ''; // 更新本地存储的性别
      wx.setStorageSync('user_info', storedUserInfo);

      // 更新本地显示：显式保存时保持原样等 loadUserProfile 刷新；自动保存时合并更新
      const compactUploaded = uploadedPhotos.filter(p => p && typeof p === 'string' && p.trim() !== '');
      const setDataUpdates = {
        'userInfo.customAvatar': customAvatar,
        savedCustomAvatar: customAvatar,
        savedPhotos: compactUploaded
      };
      if (!showToast) {
        // 合并策略：已上传的换用 cloud:// URL，保留保存期间用户新增的临时文件
        const currentPhotos = this.data.selectedPhotos;
        const mergedPhotos = [...currentPhotos];
        for (let i = 0; i < uploadedPhotos.length; i++) {
          const url = uploadedPhotos[i];
          if (url && typeof url === 'string' && url.trim() !== '') {
            mergedPhotos[i] = url;
          }
        }
        // 过滤空值生成紧凑数组
        setDataUpdates.selectedPhotos = mergedPhotos.filter(p => p && typeof p === 'string' && p.trim() !== '');
      }
      this.setData(setDataUpdates);

      if (showToast) {
        wx.hideLoading();
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });
      }

      // 清空临时文件
      this.setData({
        tempAvatar: null
      });

      // 只有显式保存才重新加载资料（自动保存直接用 cloud:// URL）
      if (showToast) {
        setTimeout(() => {
          this.loadUserProfile();
        }, 500);
      }
    } catch (e) {
      if (showToast) wx.hideLoading();
      console.error('保存失败', e);
      if (showToast) {
        wx.showToast({
          title: '保存失败，请重试',
          icon: 'none'
        });
      }
    } finally {
      this._saving = false;
      // 如果保存期间有新的修改被跳过，现在重试
      if (this._pendingSave) {
        this._pendingSave = false;
        this._autoSave(true);
      }
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
      content: `昵称：${userInfo.nickName}\n用户ID：${userInfo.userID}\n性别：${userInfo.gender || '未设置'}\n大学：${userInfo.university}\n专业：${userInfo.major}\n年级：${userInfo.grade || '未设置'}\n\n截图或复制后分享给好友`,
      confirmText: '复制全部',
      cancelText: '关闭',
      success: (res) => {
        if (res.confirm) {
          const shareText = `【我的信息】\n昵称：${userInfo.nickName}\n用户ID：${userInfo.userID}\n性别：${userInfo.gender || '未设置'}\n大学：${userInfo.university}\n专业：${userInfo.major}\n年级：${userInfo.grade || '未设置'}`;

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
  },

  /**
   * 隐藏入口：长按“退出登录”按钮进入管理页
   * （长按不会触发 bindtap，因此正常点按退出不受影响）
   */
  onLogoutLongPress() {
    wx.navigateTo({
      url: '/pages/admin-config/admin-config',
      fail: (e) => console.error('打开管理页失败:', e)
    });
  }
});
