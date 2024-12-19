const { getPool } = require("../pool-manager");
const sql = require("mssql/msnodesqlv8");

const getZoneSensors = async (req, res) => {
  console.log("getZoneSensors");
  const zoneId = req.params.zoneId;
  
  try {
    const companyId = req.headers["x-company-id"];
    const companyName = req.headers["x-company-name"];

    if (!companyId || !companyName) {
      throw new Error("Missing headers with request");
    }
    if (!zoneId || isNaN(zoneId)) {
      throw new Error("Valid zone ID is required");
    }

    const pool = await getPool(companyName);
    const query = `
      SELECT 
        s.id AS sensor_id,
        s.name AS sensor_name,
        s.serialNo AS sensor_serialNo,
        STUFF((
            SELECT ',' + CAST(z.zone_id AS VARCHAR(10))
            FROM dbo.zone_sensors zs
            INNER JOIN dbo.zones z ON zs.zone_id = z.zone_id
            WHERE zs.sensor_id = s.id AND zs.is_deleted = 0 AND z.is_deleted = 0
            FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 1, '') AS zone_ids
      FROM dbo.sensors s
      WHERE s.is_deleted = 0
      ORDER BY s.id;
    `;
    
    let results = await pool
      .request()
      .input("zoneId", sql.Int, parseInt(zoneId))
      .query(query);

    console.log("Zone sensors:", results.recordsets[0]);
    res.json(results.recordsets[0]);
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.status = error.status || "error";
    console.log(error.message);
    res.status(error.statusCode).json({
      status: error.statusCode,
      message: "Error retrieving zone sensors from database",
    });
  }
};

const assignSensorToZone = async (req, res) => {
  console.log("assignSensorToZone");
  const zoneId = req.params.zoneId;
  const { sensorId } = req.body;
  
  try {
    const companyId = req.headers["x-company-id"];
    const companyName = req.headers["x-company-name"];

    if (!companyId || !companyName) {
      throw new Error("Missing headers with request");
    }
    if (!zoneId || isNaN(zoneId) || !sensorId) {
      throw new Error("Zone ID and sensor ID are required");
    }

    const pool = await getPool(companyName);

    // Check if sensor is already assigned to this specific zone
    const checkQuery = `
      SELECT zone_id 
      FROM dbo.zone_sensors 
      WHERE sensor_id = @sensorId AND zone_id = @zoneId AND is_deleted = 0
    `;

    const existing = await pool
      .request()
      .input("zoneId", sql.Int, parseInt(zoneId))
      .input("sensorId", sql.NVarChar, sensorId)
      .query(checkQuery);

    if (existing.recordset.length > 0) {
      return res.status(400).json({
        message: "Sensor is already assigned to this zone",
      });
    }

    const insertQuery = `
      INSERT INTO dbo.zone_sensors (zone_id, sensor_id, is_deleted)
      VALUES (@zoneId, @sensorId, 0)
    `;

    await pool
      .request()
      .input("zoneId", sql.Int, parseInt(zoneId))
      .input("sensorId", sql.NVarChar, sensorId)
      .query(insertQuery);

    console.log("Sensor assigned to zone:", { sensorId, zoneId });
    res.status(201).json({ message: "Sensor assigned to zone successfully" });
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.status = error.status || "error";
    console.log(error.message);
    res.status(error.statusCode).json({
      status: error.statusCode,
      message: "Error assigning sensor to zone",
    });
  }
};

const removeSensorFromZone = async (req, res) => {
  console.log("removeSensorFromZone");
  const { zoneId, sensorId } = req.params;
  
  try {
    const companyId = req.headers["x-company-id"];
    const companyName = req.headers["x-company-name"];

    if (!companyId || !companyName) {
      throw new Error("Missing headers with request");
    }
    if (!zoneId || !sensorId) {
      throw new Error("Zone ID and sensor ID are required");
    }

    const pool = await getPool(companyName);

    const updateQuery = `
      UPDATE dbo.zone_sensors 
      SET is_deleted = 1
      WHERE zone_id = @zoneId 
        AND sensor_id = @sensorId 
        AND is_deleted = 0
    `;

    const result = await pool
      .request()
      .input("zoneId", sql.Int, parseInt(zoneId))
      .input("sensorId", sql.NVarChar, sensorId)
      .query(updateQuery);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        message: "Sensor assignment not found or already removed",
      });
    }

    console.log("Sensor removed from zone:", { sensorId, zoneId });
    res.json({ message: "Sensor removed from zone successfully" });
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.status = error.status || "error";
    console.log(error.message);
    res.status(error.statusCode).json({
      status: error.statusCode,
      message: "Error removing sensor from zone",
    });
  }
};

module.exports = {
  getZoneSensors,
  assignSensorToZone,
  removeSensorFromZone
};