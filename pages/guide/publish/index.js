Page({
  data: {
    redirecting: true
  },
  onLoad() {
    wx.setStorageSync('publishActiveTab', 'guide');
    wx.navigateTo({
      url: '/pages/add/add?tab=guide',
      fail: () => {
        this.setData({ redirecting: false });
        wx.showToast({ title: '跳转失败', icon: 'none' });
      }
    });
  }
});