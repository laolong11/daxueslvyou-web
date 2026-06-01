Component({
  methods: {
    goAddPage() {
      wx.navigateTo({
        url: '/pages/add/add',
        fail: () => {
          wx.reLaunch({ url: '/pages/add/add' });
        }
      });
    }
  }
});
