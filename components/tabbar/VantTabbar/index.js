const routes = [
  '/pages/index/index',
  '/pages/group/list/index',
  '/pages/guide/list/index',
  '/pages/message/index/index',
  '/pages/mine/index/index'
];

Component({
  properties: {
    active: {
      type: Number,
      value: 0
    },
    unread: {
      type: Number,
      value: 0
    }
  },
  observers: {
    unread(value) {
      this.setData({
        messageInfo: value > 0 ? String(value) : ''
      });
    }
  },
  data: {
    messageInfo: ''
  },
  methods: {
    onChange(event) {
      const raw = (event.detail && event.detail.name) ?? event.detail;
      const index = Number(raw);
      const target = routes[index];
      if (!target) return;
      const pages = getCurrentPages();
      const current = pages.length ? `/${pages[pages.length - 1].route}` : '';
      if (current === target) {
        return;
      }
      wx.redirectTo({
        url: target,
        fail: () => {
          wx.reLaunch({ url: target });
        }
      });
    }
  }
});
