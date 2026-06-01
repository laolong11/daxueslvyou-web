const {
  fetchUser,
  saveUser,
  uploadImageToOss,
  fetchSchools,
  MINE_PROFILE_REFRESH_KEY,
  normalizeSchoolValue,
  getSchoolDisplayText
} = require('../../../utils/api');

function downloadTempFile(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: (res) => {
        if (res && res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          resolve(res.tempFilePath);
          return;
        }
        reject(new Error('头像下载失败'));
      },
      fail: (error) => reject(new Error((error && error.errMsg) || '头像下载失败'))
    });
  });
}

Page({
  data: {
    form: {
      avatar: '/static/app_icon.png',
      nickname: ''
    },
    schoolKeyword: '',
    selectedSchool: null,
    schoolOptions: [],
    pendingAvatarPath: '',
    saving: false
  },
  schoolSearchTimer: null,
  schoolSearchToken: 0,
  onShow() {
    this.load();
  },
  async load() {
    try {
      const user = await fetchUser();
      const selectedSchool = normalizeSchoolValue(user.school);
      this.setData({
        'form.avatar': user.avatar || '/static/app_icon.png',
        'form.nickname': user.nickname || '',
        schoolKeyword: getSchoolDisplayText(selectedSchool),
        selectedSchool,
        schoolOptions: [],
        pendingAvatarPath: ''
      });
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    }
  },
  async save() {
    const form = this.data.form;
    if (!form.nickname) {
      wx.showToast({ title: '请补全昵称', icon: 'none' });
      return;
    }
    if (!this.data.selectedSchool || !this.data.selectedSchool.name) {
      wx.showToast({ title: '请选择学校', icon: 'none' });
      return;
    }
    try {
      this.setData({ saving: true });
      let avatar = form.avatar;
      if (this.data.pendingAvatarPath) {
        let uploadPath = String(this.data.pendingAvatarPath || '').trim();
        if (/^https?:\/\//i.test(uploadPath)) {
          uploadPath = await downloadTempFile(uploadPath);
        }
        if (uploadPath) {
          avatar = await uploadImageToOss(uploadPath, 'miniapp/avatar/');
        }
      }
      await saveUser({
        nickname: form.nickname,
        avatar,
        school: this.data.selectedSchool
      });
      this.setData({
        'form.avatar': avatar,
        schoolOptions: [],
        pendingAvatarPath: ''
      });
      wx.setStorageSync(MINE_PROFILE_REFRESH_KEY, 1);
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => {
        const pages = getCurrentPages();
        if (pages.length > 1) {
          wx.navigateBack({ delta: 1 });
          return;
        }
        wx.switchTab({ url: '/pages/mine/index/index' });
      }, 260);
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
  onNicknameInput(event) {
    this.setData({ 'form.nickname': event.detail.value || '' });
  },
  onSchoolInput(event) {
    const value = String(event.detail.value || '');
    const currentSchoolText = getSchoolDisplayText(this.data.selectedSchool);
    this.setData({
      schoolKeyword: value,
      selectedSchool: value.trim() && value.trim() === currentSchoolText ? this.data.selectedSchool : null,
      schoolOptions: value.trim() ? this.data.schoolOptions : []
    });
    if (this.schoolSearchTimer) {
      clearTimeout(this.schoolSearchTimer);
    }
    const keyword = value.trim();
    if (!keyword) {
      this.setData({ schoolOptions: [] });
      return;
    }
    this.schoolSearchTimer = setTimeout(() => {
      this.searchSchools(keyword);
    }, 240);
  },
  async searchSchools(keyword) {
    const currentToken = ++this.schoolSearchToken;
    try {
      const result = await fetchSchools({ keyword, limit: 20 });
      if (currentToken !== this.schoolSearchToken) return;
      const list = Array.isArray(result.list) ? result.list : [];
      this.setData({ schoolOptions: list });
    } catch (_error) {
      if (currentToken !== this.schoolSearchToken) return;
      this.setData({ schoolOptions: [] });
    }
  },
  onSelectSchool(event) {
    const school = normalizeSchoolValue(event.currentTarget.dataset.school);
    if (!school || !school.name) return;
    this.setData({
      schoolKeyword: getSchoolDisplayText(school),
      selectedSchool: school,
      schoolOptions: []
    });
  },
  onSchoolBlur() {
    setTimeout(() => {
      this.setData({ schoolOptions: [] });
    }, 120);
  },
  selectAvatarByPath(filePath) {
    if (!filePath) return;
    this.setData({
      'form.avatar': filePath,
      pendingAvatarPath: filePath
    });
  },
  async onChooseAvatar(event) {
    const avatar = event.detail && event.detail.avatarUrl;
    if (!avatar) return;
    this.selectAvatarByPath(avatar);
  },
  onUnload() {
    if (this.schoolSearchTimer) {
      clearTimeout(this.schoolSearchTimer);
      this.schoolSearchTimer = null;
    }
  }
});
