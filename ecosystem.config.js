module.exports = {
  apps: [
    {
      name: "premind-api",
      script: "dist/index.js",
      instances: 2,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        TRUST_PROXY: "1"
      },
      env_development: {
        NODE_ENV: "development",
        TRUST_PROXY: "false"
      },
      env_production: {
        NODE_ENV: "production",
        TRUST_PROXY: "1"
      }
    },
    {
      name: "premind-worker-email",
      script: "dist/workers/email-worker.js",
      instances: 1,
      env: { NODE_ENV: "production" }
    },
    {
      name: "premind-worker-order",
      script: "dist/workers/order-worker.js",
      instances: 1,
      env: { NODE_ENV: "production" }
    },
    {
      name: "premind-worker-stock",
      script: "dist/workers/stock-worker.js",
      instances: 1,
      env: { NODE_ENV: "production" }
    },
    {
      name: "premind-worker-notification",
      script: "dist/workers/notification-worker.js",
      instances: 1,
      env: { NODE_ENV: "production" }
    }
  ]
};
