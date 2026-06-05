const path = require('path');
const { unlink } = require('fs').promises;
const brandAccountModel = require('../models/brandAccountModel');
const accountModel = require('../models/accountModel');
const AppError = require('../utils/AppError');

async function create(req, res, next) {
  try {
    const name = (req.body.name || '').trim();
    if (!name) throw new AppError('Brand account name is required.', 400);
    await brandAccountModel.create({ userId: req.user.id, name });
    req.flash('success', `Brand account "${name}" created.`);
    res.redirect('/accounts');
  } catch (error) {
    next(error);
  }
}

async function show(req, res, next) {
  try {
    const brand = await brandAccountModel.findWithMembers(req.params.id, req.user.id);
    if (!brand) throw new AppError('Brand account not found.', 404);
    const allAccounts = await accountModel.listByUser(req.user.id);
    const memberIds = new Set(brand.members.map((m) => m.connected_account_id));
    const unassigned = allAccounts.filter((a) => !memberIds.has(a.id));
    res.render('brand-accounts/show', { title: brand.name, brand, unassigned });
  } catch (error) {
    next(error);
  }
}

async function addMember(req, res, next) {
  try {
    const brand = await brandAccountModel.findWithMembers(req.params.id, req.user.id);
    if (!brand) throw new AppError('Brand account not found.', 404);
    const accountId = req.body.connectedAccountId;
    if (!accountId) throw new AppError('Select a platform connection to add.', 400);
    const account = await accountModel.findForUser(accountId, req.user.id);
    if (!account) throw new AppError('Platform connection not found.', 404);
    await brandAccountModel.addMember(brand.id, accountId);
    req.flash('success', `${account.platform} @${account.username} added to ${brand.name}.`);
    res.redirect(`/accounts/brands/${brand.id}`);
  } catch (error) {
    next(error);
  }
}

async function removeMember(req, res, next) {
  try {
    const brand = await brandAccountModel.findWithMembers(req.params.id, req.user.id);
    if (!brand) throw new AppError('Brand account not found.', 404);
    await brandAccountModel.removeMember(brand.id, req.params.accountId);
    req.flash('success', 'Platform removed from brand account.');
    res.redirect(`/accounts/brands/${brand.id}`);
  } catch (error) {
    next(error);
  }
}

async function rename(req, res, next) {
  try {
    const name = (req.body.name || '').trim();
    if (!name) throw new AppError('Name is required.', 400);
    const brand = await brandAccountModel.rename(req.params.id, req.user.id, name);
    if (!brand) throw new AppError('Brand account not found.', 404);
    req.flash('success', 'Brand account renamed.');
    res.redirect(`/accounts/brands/${req.params.id}`);
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const brand = await brandAccountModel.remove(req.params.id, req.user.id);
    if (!brand) throw new AppError('Brand account not found.', 404);
    req.flash('success', 'Brand account deleted.');
    res.redirect('/accounts');
  } catch (error) {
    next(error);
  }
}

async function uploadWatermark(req, res, next) {
  try {
    const brand = await brandAccountModel.findWithMembers(req.params.id, req.user.id);
    if (!brand) throw new AppError('Brand account not found.', 404);

    if (!req.file) throw new AppError('Please select a PNG or WebP image.', 400);

    const relativePath = path.relative(process.cwd(), req.file.path).replace(/\\/g, '/');

    // Delete old file only when it has a different path (different extension).
    // If paths are the same, multer already overwrote it — deleting would erase the new file.
    if (brand.watermark_path && brand.watermark_path !== relativePath) {
      try { await unlink(path.resolve(process.cwd(), brand.watermark_path)); } catch { /* ignore */ }
    }

    const opacity = Math.min(1, Math.max(0.05, (parseInt(req.body.opacity, 10) || 50) / 100));
    const position = ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(req.body.position)
      ? req.body.position : 'center';
    const size = Math.min(50, Math.max(5, parseInt(req.body.size, 10) || 20));

    await brandAccountModel.updateWatermark(brand.id, req.user.id, { watermarkPath: relativePath, opacity, position, size });
    req.flash('success', 'Watermark saved.');
    res.redirect(`/accounts/brands/${brand.id}`);
  } catch (error) {
    next(error);
  }
}

async function removeWatermark(req, res, next) {
  try {
    const brand = await brandAccountModel.findWithMembers(req.params.id, req.user.id);
    if (!brand) throw new AppError('Brand account not found.', 404);

    if (brand.watermark_path) {
      try { await unlink(path.resolve(process.cwd(), brand.watermark_path)); } catch { /* ignore */ }
    }
    await brandAccountModel.updateWatermark(brand.id, req.user.id, { watermarkPath: null, opacity: 0.5, position: 'center' });
    req.flash('success', 'Watermark removed.');
    res.redirect(`/accounts/brands/${brand.id}`);
  } catch (error) {
    next(error);
  }
}

async function updateWatermarkSettings(req, res, next) {
  try {
    const brand = await brandAccountModel.findWithMembers(req.params.id, req.user.id);
    if (!brand) throw new AppError('Brand account not found.', 404);
    if (!brand.watermark_path) throw new AppError('No watermark uploaded yet.', 400);

    const opacity = Math.min(1, Math.max(0.05, (parseInt(req.body.opacity, 10) || 50) / 100));
    const position = ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(req.body.position)
      ? req.body.position : 'center';
    const size = Math.min(50, Math.max(5, parseInt(req.body.size, 10) || 20));

    await brandAccountModel.updateWatermark(brand.id, req.user.id, { watermarkPath: brand.watermark_path, opacity, position, size });
    req.flash('success', 'Watermark settings updated.');
    res.redirect(`/accounts/brands/${brand.id}`);
  } catch (error) {
    next(error);
  }
}

module.exports = { create, show, addMember, removeMember, rename, remove, uploadWatermark, removeWatermark, updateWatermarkSettings };
