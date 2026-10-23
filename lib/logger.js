const pino = require('pino');
// App logger. Baileys gets its own silent logger to avoid noise.
const log = pino({ level: process.env.LOG_LEVEL || 'info' });
const baileysLogger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' });
module.exports = log;
module.exports.baileysLogger = baileysLogger;
