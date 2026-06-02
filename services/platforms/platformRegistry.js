const instagram = require('./instagramService');
const facebook = require('./facebookService');
const pinterest = require('./pinterestService');
const youtube = require('./youtubeService');
const tiktok = require('./tiktokService');

const services = { instagram, facebook, pinterest, youtube, tiktok };

function getPlatformService(platform) {
  const service = services[platform];
  if (!service) throw new Error(`Unsupported platform: ${platform}`);
  return service;
}

module.exports = { getPlatformService, services };
