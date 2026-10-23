// Prints a SESSION_ID string from your local ./session/creds.json
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'session', 'creds.json');
if (!fs.existsSync(file)) {
  console.error('No session found. Start the bot and log in first.');
  process.exit(1);
}
console.log('AYAN~' + Buffer.from(fs.readFileSync(file)).toString('base64'));
