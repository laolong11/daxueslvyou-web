const { fetchUserProfile, getSchoolDisplayText } = require('../../utils/api');

Page({
  data: {
    loading: true,
    user: null
  },
  userId: '',
  onLoad(options) {
    this.userId = String((options && options.id) || '').trim();
    this.load();
  },
  async load() {
    if (!this.userId) {
      this.setData({ loading: false, user: null });
      return;
    }
    this.setData({ loading: true });
    try {
      const profile = await fetchUserProfile(this.userId);
      this.setData({
        user: Object.assign({}, profile, {
          schoolText: getSchoolDisplayText(profile.school)
        })
      });
    } catch (error) {
      this.setData({ user: null });
      wx.showToast({ title: error.message || '资料加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
  async onPullDownRefresh() {
    try {
      await this.load();
    } finally {
      wx.stopPullDownRefresh();
    }
  }
});