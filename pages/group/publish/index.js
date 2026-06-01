Page({
  data: {
    redirecting: true
  },
  onLoad() {
    wx.setStorageSync('publishActiveTab', 'group');
    wx.navigateTo({
      url: '/pages/add/add?tab=group',
      fail: () => {
        this.setData({ redirecting: false });
        wx.showToast({ title: '跳转失败', icon: 'none' });
      }
    });
  }
});
