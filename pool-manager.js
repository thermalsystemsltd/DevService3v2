const mssql = require("mssql/msnodesqlv8");
const metaConfig = require("./db-config");

let poolConfigs = new Map();
let activePools = new Map();

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds

module.exports = {
  initializeConfig: async () => {
    console.log("Initializing...");
    try {
      // Fetch the initial central DB connection details
      // const metaDBConfig = configs.MetaDB;
      const metaPool = new mssql.ConnectionPool(metaConfig.config);
      await metaPool.connect();

      // Query to fetch other DB configurations
      const result = await metaPool.query(`
        SELECT id, name, dbUser, dbPassword, dbHost, dbName
        FROM db1.dbo.companies
      `);
      metaPool.close(); // Close metaDB connection after fetching data

      result.recordset.forEach((db) => {
        // Use a regular expression to extract the port number from host
        const match = db.dbHost.match(/,(.*?)\\/);
        // match[1] should contain the port number if it exists
        const port = match ? match[1] : null;

        const config = {
          id: db.id,
          database: db.dbName,
          server: db.dbHost,
          driver: "msnodesqlv8",
          port: port,
          user: db.dbUser,
          password: db.dbPassword,
          // need reviewing
          options: {
            // encrypt: true,
            // enableArithAbort: true,
            trustedConnection: false,
          },
          connectionTimeout: 200000,
          requestTimeout: 200000,
          pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 60000,
          },
        };
        poolConfigs.set(db.name, config);
        console.log("\tID:",db.id, " ", db.name);
      });
    } catch (error) {
      console.error(error);
    }
  },
  // Lazy load connection pool
  getPool: async (name) => {
    try {
      let poolEntry = activePools.get(name);

      // If pool already connected, clear the existing timeout
      if (poolEntry) {
        clearTimeout(poolEntry.timeout);
      } else {
        // Pool not connected, connect
        const poolConfig = poolConfigs.get(name);
        if (!poolConfig) {
          throw Error(`No DB connection for: ${name}`);
        }
        // console.log(poolConfig);
        const pool = new mssql.ConnectionPool(poolConfig);
        await pool.connect();

        poolEntry = {
          pool: pool,
          timeout: null, // Placeholder for timeout
        };

        activePools.set(name, poolEntry);
      }

      // Reset timeout every time the pool is accessed
      poolEntry.timeout = setTimeout(() => {
        poolEntry.pool
          .close()
          .then(() => {
            console.log(`\tClosed pool for ${name} due to inactivity.`);
          })
          .catch((err) => {
            console.error(`Error closing pool for ${name}:`, err);
          });
        activePools.delete(name); // Remove the pool from the map once closed
      }, INACTIVITY_TIMEOUT);

      return poolEntry.pool;
    } catch (error) {
      console.error(error);
    }
  },

  getID: (name) => {
    // console.log(poolConfigs.get(name).id)
    return poolConfigs.get(name).id;
  },
  // Close all pools
  closeAll: async () => {
    activePools.forEach((entry, name) => {
      clearTimeout(entry.timeout);
      entry.pool
        .close()
        .then(() => {
          console.log(`Closed pool for ${name} manually.`);
        })
        .catch((err) => {
          console.error(`Error closing pool for ${name}:`, err);
        });
    });
    activePools.clear();
  },

  // List active connections
  listActiveConnections: () => {
    return Array.from(activePools.keys());
  },
};
