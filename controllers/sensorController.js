const { getPool } = require("../pool-manager");
const sql = require("mssql/msnodesqlv8");

const getSensorList = async (req, res) => {
  console.log("getSensorList: ");
  const companyId = req.headers["x-company-id"]; // Accessing from headers
  const companyName = req.headers["x-company-name"]; // Accessing from headers
  try {
    if (!companyId || !companyName)
      throw new Error("Missing headers with request");
    const pool = await getPool(companyName); //name of connection pool associate with dynamic pull from meta database later
    const query = `
      SELECT 
        s.name, 
        s.id, 
        s.serialNo, 
        s.type,
        s.created_at, 
        s.updated_at, 
        s.is_deleted,
        sd.RSSI,
        sd.SNR,
        sd.Battery
      FROM dbo.sensors s
      LEFT JOIN (
        SELECT 
          sensor_id,
          RSSI,
          SNR,
          Battery,
          created_at,
          ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY created_at DESC) as rn
        FROM dbo.sensor_data
      ) sd ON s.serialNo = sd.sensor_id AND sd.rn = 1
      WHERE s.is_deleted = 0`;
    let results = await pool.request().query(query);
    console.log("Sensors: ", results.recordsets[0]);
    res.json(results.recordsets[0]);
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.status = error.status || "error";
    console.log(error.message);
    res.status(error.statusCode).json({
      status: error.statusCode,
      message: "Error Requesting Sensor List from Database",
    });
  }
};

const addNewSensor = async (req, res) => {
  console.log("addNewSensor");
  const { serialNo, name, type } = req.body; // Accessing data from the body
  try {
    const companyId = req.headers["x-company-id"]; // Accessing from headers
    const companyName = req.headers["x-company-name"]; // Accessing from headers

    if (!companyId || !companyName) {
      throw new Error("Missing headers with request");
    }
    if (!serialNo || !name || !type) {
      throw new Error("Missing data in body");
    }

    const pool = await getPool(companyName); //name of connection pool associate with dynamic pull from meta database later

    const checkQuery = `
      SELECT id, is_deleted FROM dbo.sensors
      WHERE serialNo = @serialNo OR (name = @name AND is_deleted = 0)
    `;
    const existing = await pool
      .request()
      .input("serialNo", sql.Int, serialNo)
      .input("name", sql.NVarChar, name)
      .query(checkQuery);

    // If we find an active sensor with the same name, reject
    if (existing.recordset.some(record => !record.is_deleted && record.name === name)) {
      console.log("Duplicate Found, cancelling Add Req");
      return res.status(400).json({
        message: "Sensor with same name already exists.",
      });
    }

    // Check if we found a deleted sensor with the same serial number
    const deletedSensor = existing.recordset.find(record => record.is_deleted);
    
    if (deletedSensor) {
      // Update the existing deleted sensor
      const updateQuery = `
        UPDATE dbo.sensors 
        SET name = @name,
            type = @type,
            updated_at = GETDATE(),
            is_deleted = 0
        WHERE id = @id
      `;
      
      await pool
        .request()
        .input("id", sql.Int, deletedSensor.id)
        .input("name", sql.NVarChar, name)
        .input("type", sql.Int, type)
        .query(updateQuery);
      
      console.log("Sensor reactivated: ", serialNo, "-", name);
      res.status(200).json({ message: "Sensor reactivated successfully" });
    } else {
      // Insert new sensor
      const insertQuery = `    
        INSERT INTO dbo.sensors (serialNo, name, type, created_at, updated_at, is_deleted)
        VALUES (@serialNo, @name, @type, GETDATE(), GETDATE(), 0)
      `;
      
      await pool
        .request()
        .input("serialNo", sql.Int, serialNo)
        .input("name", sql.NVarChar, name)
        .input("type", sql.Int, type)
        .query(insertQuery);
      
      console.log("New sensor added: ", serialNo, "-", name);
      res.status(201).json({ message: "New sensor added successfully" });
    }
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.status = error.status || "error";
    console.log(error.message);
    res.status(error.statusCode).json({
      status: error.statusCode,
      message: "Error adding Sensor to Database",
    });
  }
};
const updateSensor = async (req, res) => {
  console.log("updateSensor");
  const { sensorId, sensorName } = req.body; // Accessing data from the body
  try {
    const companyId = req.headers["x-company-id"]; // Accessing from headers
    const companyName = req.headers["x-company-name"]; // Accessing from headers

    if (!companyId || !companyName) {
      throw new Error("Missing headers with request");
    }
    if (!sensorId || !sensorName) {
      throw new Error("Missing data in body");
    }

    const pool = await getPool(companyName);

    const checkQuery = `
    SELECT 1 FROM dbo.sensors
    WHERE (name = @sensorName) AND is_deleted = 0
  `;
    const existing = await pool
      .request()
      .input("sensorName", sensorName)
      .query(checkQuery);

    if (existing.recordset.length > 0) {
      console.log("Duplicate Found, cancelling Update Req");
      return res.status(400).json({
        message: "Sensor with same serial number or name already exists.",
      });
    }
    const query = `
    UPDATE dbo.sensors 
    SET name = @sensorName, 
    updated_at = GETDATE()
    WHERE id = @sensorId
    `;

    let results = await pool
      .request()
      .input("sensorName", sql.NVarChar, sensorName)
      .input("sensorId", sql.Int, sensorId)
      .query(query);
    console.log("Updated Sensor: ", sensorId);
    res.json(results.recordsets[0]);
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.status = error.status || "error";
    console.log(error.message);
    res.status(error.statusCode).json({
      status: error.statusCode,
      message: "Error Updating Sensor in Database",
    });
  }
};
const deleteSensor = async (req, res) => {
  console.log("deleteSensor");
  const sensorId = req.params.id; // Get ID from URL parameter
  console.log("Deleting sensor with ID:", sensorId);
  
  try {
    const companyId = req.headers["x-company-id"]; // Accessing from headers
    const companyName = req.headers["x-company-name"]; // Accessing from headers

    if (!companyId || !companyName) {
      console.log("Missing headers:", { companyId, companyName });
      throw new Error("Missing headers with request");
    }
    if (!sensorId || isNaN(sensorId)) {
      console.log("Invalid sensor ID:", sensorId);
      throw new Error("Missing data in body");
    }
    
    const pool = await getPool(companyName); //name of connection pool associate with dynamic pull from meta database later

    console.log("Checking if sensor exists...");
    // First check if sensor exists and is not already deleted
    const checkQuery = `
      SELECT 1 FROM dbo.sensors 
      WHERE id = @sensorId AND is_deleted = 0
    `;
    
    const existing = await pool
      .request()
      .input("sensorId", sql.Int, parseInt(sensorId))
      .query(checkQuery);

    if (existing.recordset.length === 0) {
      console.log("Sensor not found or already deleted");
      return res.status(404).json({
        message: "Sensor not found or already deleted",
      });
    }

    console.log("Sensor found, proceeding with deletion...");
    const query = `
      UPDATE dbo.sensors 
      SET is_deleted = 1, 
          updated_at = GETDATE(),
          name = CONCAT(name, '_DELETED_', FORMAT(GETDATE(), 'yyyyMMddHHmmss'))
      WHERE id = @sensorId
    `;

    await pool
      .request()
      .input("sensorId", sql.Int, parseInt(sensorId))
      .query(query);
    
    console.log("Sensor successfully deleted");
    res.status(200).json({ message: "Sensor successfully deleted" });
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.status = error.status || "error";
    console.error("Error deleting sensor:", error);
    res.status(error.statusCode).json({
      status: error.statusCode,
      message: error.message || "Error deleting sensor from database",
    });
  }
};

module.exports = {
  getSensorList,
  addNewSensor,
  updateSensor,
  deleteSensor,
};