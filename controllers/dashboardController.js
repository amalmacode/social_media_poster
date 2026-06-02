const accountModel = require('../models/accountModel');
const postModel = require('../models/postModel');

async function dashboard(req, res, next) {
  try {
    const [accounts, recentPosts, counts] = await Promise.all([
      accountModel.listByUser(req.user.id),
      postModel.listByUser(req.user.id, { limit: 8 }),
      postModel.dashboardCounts(req.user.id)
    ]);
    res.render('dashboard/index', { title: 'Dashboard', accounts, recentPosts, counts });
  } catch (error) {
    next(error);
  }
}

module.exports = { dashboard };
