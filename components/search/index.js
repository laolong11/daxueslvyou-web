
Page({
  openSearchPage() {
    wx.navigateTo({
      url: '/pages/search/index',
      fail: () => {
        wx.reLaunch({ url: '/pages/search/index' });
      }
    });
  },
})