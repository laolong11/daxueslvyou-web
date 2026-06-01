const appInfo = require('../../utils/appInfo');

Component({
  data: {
    appName: appInfo.name,
    version: appInfo.version,
    build: appInfo.build,
    slogan: appInfo.slogan
  }
});
