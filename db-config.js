require("dotenv").config();

module.exports = {
  name: "MetaDB",
  id: 3,
  config: {
    database: process.env.DATABASE,
    server: process.env.SERVER,
    driver: process.env.DRIVER,
    port: process.env.PORT,
    user: process.env.USER,
    password: process.env.PASSWORD,
    connectionTimeout: 200000,
    options: {
      trustedConnection: false,
    },
    connectionTimeout: 200000,
    requestTimeout: 200000,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 60000,
    },
  },
};
