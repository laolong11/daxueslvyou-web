function setCache(key, value, ttl = 300000) {
  wx.setStorageSync(key, {
    value,
    expireAt: Date.now() + ttl
  });
}

function getCache(key) {
  const entry = wx.getStorageSync(key);
  if (!entry || !entry.expireAt) {
    return null;
  }
  if (Date.now() > entry.expireAt) {
    wx.removeStorageSync(key);
    return null;
  }
  return entry.value;
}

module.exports = {
  setCache,
  getCache
};
