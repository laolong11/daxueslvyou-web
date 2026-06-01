const API_BASE = 'http://127.0.0.1:3000/api';

function request(url, options = {}) {
  const token = wx.getStorageSync('auth_token');
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}${url}`,
      method: options.method || 'GET',
      data: options.data || {},
      timeout: 10000,
      header: {
        'content-type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
        ...(options.header || {})
      },
      success: (res) => {
        if (res.statusCode >= 400) {
          if (res.statusCode === 401) {
            wx.removeStorageSync('auth_token');
          }
          reject(new Error(res.data?.message || '请求失败'));
          return;
        }
        resolve(res.data);
      },
      fail: (err) => {
        reject(new Error(err.errMsg || '请求失败'));
      }
    });
  });
}

module.exports = {
  request
};
