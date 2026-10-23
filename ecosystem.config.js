module.exports = {
  apps: [{
    name: 'ayan-xd',
    script: 'index.js',
    autorestart: true,
    max_restarts: 20,
    restart_delay: 5000,
    max_memory_restart: '500M',
    env: { NODE_ENV: 'production' },
  }],
};
