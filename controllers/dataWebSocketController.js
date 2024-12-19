const { getPool } = require("../pool-manager");

const getLiveData = async (companyId, companyName) => {
  console.log("getLiveData for Company:", companyName);

  try {
    if (!companyId || !companyName) {
      throw new Error("Missing headers with request");
    }

    const pool = await getPool(companyName); //name of connection pool associate with dynamic pull from meta database later

    const query = `
        SELECT s.serialNo AS sensor_id, s.name AS sensor_name, sd.temperature, sd.created_at AS timestamp
          FROM sensors s
          JOIN (
              SELECT sensor_id, MAX(created_at) AS MaxTimestamp
              FROM sensor_data
              GROUP BY sensor_id
          ) latest ON s.serialNo = latest.sensor_id
          JOIN sensor_data sd ON s.serialNo = sd.sensor_id AND sd.created_at = latest.MaxTimestamp
          WHERE s.is_deleted = 'false';
    `;

    let results = await pool.request().query(query);
    console.log("Probe Data: ", results.recordsets[0]);
    return results.recordsets[0];
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.status = error.status || "error";
    console.error(error.message);
    res.status(error.statusCode).json({
      message: "Error Requesting Data from Database",
    });
  }
};

module.exports = {
  getLiveData: getLiveData,
};
