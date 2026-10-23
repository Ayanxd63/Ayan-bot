/**
 * AYAN XD - entry point
 */
const express = require('express');
const config = require('./config');
const log = require('./lib/logger');
const plugins = require('./lib/plugins');
const db = require('./lib/db');
const { connect } = require('./lib/client');

process.on('unhandledRejection', (err) => log.error({ err }, 'Unhandled rejection'));
process.on('uncaughtException', (err) => {
  log.fatal({ err }, 'Uncaught exception, exiting for PM2/Docker restart');
  Promise.race([db.flush(true), new Promise((r) => setTimeout(r, 3000))]).finally(() => process.exit(1));
});

// Tiny health endpoint (needed by Koyeb / Render / Heroku web dynos)
express()
  .get('/', (_req, res) => res.json({ bot: config.BOT_NAME, status: 'running', plugins: config.getPluginCount() }))
  .listen(config.PORT, () => log.info(`Health server on :${config.PORT}`))
  // On shared panels the port may be taken or not allocated; the bot must keep running anyway
  .on('error', (err) => log.warn(`Health server disabled: ${err.message}`));

(async () => {
  await db.init();
  plugins.load();
  await connect();
})().catch((err) => { log.fatal({ err }, 'Startup failed'); process.exit(1); });
