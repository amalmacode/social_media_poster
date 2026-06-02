require('dotenv').config();

const app = require('./app');
const { env } = require('./config/env');

app.listen(env.port, () => {
  console.log(`Publisher app listening on ${env.appUrl}`);
});
