const express = require('express');

const router = express.Router();

router.get('/:platform', (req, res) => {
  res.status(200).send(req.query['hub.challenge'] || 'ok');
});

router.post('/:platform', express.json({ type: '*/*' }), (req, res) => {
  console.log('Webhook received', { platform: req.params.platform, body: req.body });
  res.sendStatus(202);
});

module.exports = router;
