const {
  connectRealtime,
  fetchGuideDetail,
  fetchUserProfile,
  getSchoolDisplayText,
  toggleGuideFavorite,
  toggleGuideLike,
  hasAuthToken,
  goLoginPage
} = require('../../../utils/api');

const SHARE_OPTIONS = [
  [{ name: '微信好友', icon: 'wechat' }, { name: '朋友圈', icon: 'wechat-moments' }],
  [{ name: '复制链接', icon: 'link' }, { name: '生成海报', icon: 'poster' }]
];

Page({
  data: {
    guide: null,
    loading: true,
    showUserDialog: false,
    userDialogLoading: false,
    userProfile: null,
    showShareSheet: false,
    shareOptions: SHARE_OPTIONS
  },
  offRealtime: null,
  id: '',
  onLoad(options) {
    this.id = options.id;
    this.load();
    this.offRealtime = connectRealtime((payload) => {
      if (!payload || !payload.event) return;
      if (payload.event === 'guide_updated' || payload.event === 'guide_created') {
        this.load();
      }
    });
  },
  onUnload() {
    if (this.offRealtime) {
      this.offRealtime();
      this.offRealtime = null;
    }
  },
  async load() {
    this.setData({ loading: true });
    try {
      const guide = await fetchGuideDetail(this.id);
      this.setData({ guide });
    } catch (error) {
      this.setData({ guide: null });
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
  async like() {
    if (!hasAuthToken()) {
      goLoginPage();
      return;
    }
    const guide = this.data.guide || {};
    if (guide.auditStatus !== 'approved' || guide.isOwner) {
      wx.showToast({ title: '当前不可点赞', icon: 'none' });
      return;
    }
    try {
      await toggleGuideLike(this.id);
      wx.showToast({ title: '已点赞', icon: 'success' });
      this.load();
    } catch (error) {
      wx.showToast({ title: error.message || '点赞失败', icon: 'none' });
    }
  },
  async favorite() {
    if (!hasAuthToken()) {
      goLoginPage();
      return;
    }
    const guide = this.data.guide || {};
    if (guide.auditStatus !== 'approved' || guide.isOwner) {
      wx.showToast({ title: '当前不可收藏', icon: 'none' });
      return;
    }
    try {
      await toggleGuideFavorite(this.id);
      wx.showToast({ title: '已收藏', icon: 'success' });
      this.load();
    } catch (error) {
      wx.showToast({ title: error.message || '收藏失败', icon: 'none' });
    }
  },
  async openAuthorProfile() {
    const guide = this.data.guide || {};
    const userId = String(guide.userId || '').trim();
    if (!userId) return;
    this.setData({
      showUserDialog: true,
      userDialogLoading: true,
      userProfile: null
    });
    try {
      const profile = await fetchUserProfile(userId);
      this.setData({
        userProfile: Object.assign({}, profile, {
          schoolText: getSchoolDisplayText(profile.school)
        })
      });
    } catch (error) {
      wx.showToast({ title: error.message || '用户资料加载失败', icon: 'none' });
      this.setData({ showUserDialog: false });
    } finally {
      this.setData({ userDialogLoading: false });
    }
  },
  closeUserDialog() {
    this.setData({
      showUserDialog: false,
      userDialogLoading: false,
      userProfile: null
    });
  },
  openShareSheet() {
    const guide = this.data.guide || {};
    if (!guide || guide.auditStatus !== 'approved') return;
    this.setData({ showShareSheet: true });
  },
  closeShareSheet() {
    this.setData({ showShareSheet: false });
  },
  onShareSelect(event) {
    const option = (event && event.detail && event.detail.option) || {};
    const guide = this.data.guide || {};
    this.setData({ showShareSheet: false });
    wx.showToast({
      title: `${option.name || '分享'}演示：${guide.authorName || '发布者'}`,
      icon: 'none'
    });
  }
});
