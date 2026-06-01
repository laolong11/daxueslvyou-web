function parseDateTime(rawDate, rawTime = '00:00') {
  if (!rawDate) return null;
  const normalized = `${rawDate} ${rawTime}`.replace(/-/g, '/');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function getGapText(expireAt, date, departureTime, detailed = false) {
  const expire = expireAt ? new Date(String(expireAt).replace(/-/g, '/')) : null;
  const departure = parseDateTime(date, departureTime);
  if (!expire || !departure) {
    return '未设置';
  }
  let diff = departure.getTime() - expire.getTime();
  if (diff < 0) diff = 0;
  const day = Math.floor(diff / (24 * 3600 * 1000));
  const hour = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
  const minute = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
  const second = Math.floor((diff % (60 * 1000)) / 1000);
  if (detailed) {
    return `${day}天${hour}小时${minute}分${second}秒`;
  }
  return `${day}天${hour}小时`;
}

function parseExpireTimestamp(expireAt) {
  if (!expireAt) return null;
  const normalized = String(expireAt).replace(/-/g, '/');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.getTime();
}

function getCountdownMs(expireAt, now = Date.now()) {
  const expireTime = parseExpireTimestamp(expireAt);
  if (!expireTime) {
    return 0;
  }
  return Math.max(expireTime - now, 0);
}

module.exports = {
  parseDateTime,
  getGapText,
  getCountdownMs
};
