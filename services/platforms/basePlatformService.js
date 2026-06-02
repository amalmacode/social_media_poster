const axios = require('axios');
const AppError = require('../../utils/AppError');

class BasePlatformService {
  constructor(platform) {
    this.platform = platform;
    this.client = axios.create({ timeout: 30000 });
  }

  async validateContent() {
    return { ok: true, errors: [] };
  }

  async refreshToken(account) {
    return account;
  }

  normalizeError(error) {
    const status = error.response?.status;
    const data = error.response?.data;
    const retryable = !status || status === 429 || status >= 500;
    return {
      retryable,
      message: data?.error?.message || error.message || `${this.platform} API error`,
      response: data || null
    };
  }

  permanent(message, details) {
    throw new AppError(message, 400, { platform: this.platform, retryable: false, ...details });
  }
}

module.exports = BasePlatformService;
