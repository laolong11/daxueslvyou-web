// app.js
App({
  globalData: {
    bootReady: false,
    bootProgress: 0,
    bootText: '准备加载资源...'
  },
  onLaunch() {
    this.bootListeners = new Set();
    this.bootPromise = this.bootstrap();
  },
  updateBootProgress(progress, text) {
    this.globalData.bootProgress = progress;
    this.globalData.bootText = text;
    if (!this.bootListeners) return;
    this.bootListeners.forEach((listener) => {
      listener({ progress, text });
    });
  },
  subscribeBootProgress(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    if (!this.bootListeners) {
      this.bootListeners = new Set();
    }
    this.bootListeners.add(listener);
    listener({
      progress: this.globalData.bootProgress,
      text: this.globalData.bootText
    });
    return () => {
      this.bootListeners.delete(listener);
    };
  },
  preloadImage(src) {
    return new Promise((resolve) => {
      wx.getImageInfo({
        src,
        success: () => resolve(),
        fail: () => resolve()
      });
    });
  },
  async bootstrap() {
    this.updateBootProgress(0, '准备加载资源...');
    const { fetchGroups, fetchGuides } = require('./utils/api');
    const tasks = [
      () => this.preloadImage('/static/app_icon.png'),
      () => this.preloadImage('/static/tabbar/add.png'),
      () => this.preloadImage('/static/tabbar/dibu_wo_weixuanzhongzhuangtai.png'),
      () => this.preloadImage('/static/tabbar/dibu_wo_yixuanzhongzhuangtai.png'),
      () => this.preloadImage('/static/tabbar/dibu_zhuye_weixuanzhongzhuangtai.png'),
      () => this.preloadImage('/static/tabbar/dibu_zhuye_yixuanzhongzhuangtai.png'),
      () => this.preloadImage('/static/tabbar/faxian_jiatingjiaoyu.png'),
      () => this.preloadImage('/static/tabbar/gerenzhongxin_wodediqu.png'),
      () => fetchGroups({ page: 1 }),
      () => fetchGuides({ page: 1 })
    ];
    const total = tasks.length;
    let completed = 0;

    await Promise.all(
      tasks.map(async (runTask) => {
        try {
          await runTask();
        } catch (error) {
          // 预加载失败不阻塞启动，仅影响本地预热命中率。
        } finally {
          completed += 1;
          const percent = Math.floor((completed / total) * 100);
          this.updateBootProgress(percent, `正在加载资源 ${completed}/${total}`);
        }
      })
    );

    this.globalData.bootReady = true;
    this.updateBootProgress(100, '资源加载完成');
  },
  waitForBoot() {
    return this.bootPromise || Promise.resolve();
  }
});
