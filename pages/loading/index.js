Page({
  data: {
    progress: 0,
    done: false,
    progressText: '准备加载资源...'
  },
  MIN_LOADING_MS: 0,
  unsubscribeProgress: null,
  async onLoad() {
    const startedAt = Date.now();
    const app = getApp();
    if (app && typeof app.subscribeBootProgress === 'function') {
      this.unsubscribeProgress = app.subscribeBootProgress(({
        progress,
        text
      }) => {
        this.setData({
          progress,
          progressText: text || '正在加载资源...'
        });
      });
    }
    try {
      if (app && typeof app.waitForBoot === 'function') {
        await app.waitForBoot();
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }

      this.setData({
        progress: 100,
        done: true,
        progressText: '资源加载完成'
      });

      const remain = this.MIN_LOADING_MS - (Date.now() - startedAt);
      if (remain > 0) {
        await new Promise((resolve) => setTimeout(resolve, remain));
      }

      await new Promise((resolve) => setTimeout(resolve, 120));
      wx.switchTab({
        url: '/pages/index/index'
      });
    } catch (error) {
      this.setData({
        progress: 100,
        done: true,
        progressText: '资源加载完成'
      });
      const remain = this.MIN_LOADING_MS - (Date.now() - startedAt);
      if (remain > 0) {
        await new Promise((resolve) => setTimeout(resolve, remain));
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
      wx.switchTab({
        url: '/pages/index/index'
      });
    }
  },
  onUnload() {
    if (this.unsubscribeProgress) {
      this.unsubscribeProgress();
      this.unsubscribeProgress = null;
    }
  }
});