const {
  wechatLogin,
  MINE_PROFILE_REFRESH_KEY,
  MINE_LIST_REFRESH_KEY
} = require('../../../utils/api');

Page({
  data: {
    agreed: false,
    loading: false
  },
  onAgreeChange(event) {
    const values = event.detail.value || [];
    this.setData({ agreed: values.includes('agree') });
  },
  async wechatLogin() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先同意协议', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        });
      });
      if (!loginRes.code) {
        throw new Error('微信登录失败，请重试');
      }
      await wechatLogin(loginRes.code, {
        nickname: '微信用户',
        avatar: ''
      });
      wx.setStorageSync(MINE_PROFILE_REFRESH_KEY, 1);
      wx.setStorageSync(MINE_LIST_REFRESH_KEY, 1);
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => {
        this.safeBack();
      }, 300);
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '登录失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
  cancel() {
    wx.reLaunch({ url: '/pages/index/index' });
  },
  safeBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.reLaunch({ url: '/pages/index/index' });
  }
});
