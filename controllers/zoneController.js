const { getPool } = require("../pool-manager");
const sql = require("mssql/msnodesqlv8");

const getZoneList = async (req, res) => {
  console.log("getZoneList: ");
  const companyId = req.headers["x-company-id"];
  const companyName = req.headers["x-company-name"];
  
  try {
    if (!companyId || !companyName)
      throw new Error("Missing headers with request");
    
    const pool = await getPool(companyName);
    const query = `
      SELECT 
        z.zone_id,
        z.zone_name,
        z.is_deleted,
        COUNT(CASE WHEN zs.is_deleted = 0 THEN 1 END) as sensor_count
      FROM dbo.zones z
      LEFT JOIN dbo.zone_sensors zs ON z.zone_id = zs.zone_id
      WHERE z.is_deleted = 0
      GROUP BY 
        z.zone_id,
        z.zone_name,
        z.is_deleted
      ORDER BY z.zone_name
    `;
    
    let results = await pool.request().query(query);
    console.log("Zones:", results.recordsets[0]);
    res.json(results.recordsets[0]);
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.status = error.status || "error";
    console.log(error.message);
    res.status(error.statusCode).json({
      status: error.statusCode,
      message: "Error Requesting Zones List from Database",
    });
  }
};

const addNewZone = async (req, res) => {
  console.log("addNewZone");
  const { zoneName } = req.body;
  
  try {
    const companyId = req.headers["x-company-id"];
    const companyName = req.headers["x-company-name"];

    if (!companyId || !companyName) {
      throw new Error("Missing headers with request");
    }
    
    // Check if zoneName exists and is not empty
    if (!zoneName || zoneName.trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: "Zone name is required and cannot be empty"
      });
    }

    const pool = await getPool(companyName);

    const checkQuery = `
      SELECT 1 FROM dbo.zones
      WHERE zone_name = @zoneName AND is_deleted = 0
    `;
    
    const existing = await pool
      .request()
      .input("zoneName", sql.NVarChar, zoneName.trim())
      .query(checkQuery);

    if (existing.recordset.length > 0) {
      return res.status(400).json({
        message: "Zone with this name already exists",
      });
    }

    const insertQuery = `
      INSERT INTO dbo.zones (zone_name, is_deleted)
      VALUES (@zoneName, 0)
    `;

    await pool
      .request()
      .input("zoneName", sql.NVarChar, zoneName.trim())
      .query(insertQuery);

    console.log("New zone added:", zoneName);
    res.status(201).json({ message: "Zone added successfully" });
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    console.log(error.message);
    res.status(500).json({
      status: 'error',
      message: error.message || "Error adding zone to database"
    });
  }
};

const updateZone = async (req, res) => {
  console.log("updateZone");
  const { zoneId, zoneName } = req.body;
  
  try {
    const companyId = req.headers["x-company-id"];
    const companyName = req.headers["x-company-name"];

    if (!companyId || !companyName) {
      throw new Error("Missing headers with request");
    }
    if (!zoneId || !zoneName) {
      throw new Error("Zone ID and name are required");
    }

    const pool = await getPool(companyName);

    const checkQuery = `
      SELECT 1 FROM dbo.zones
      WHERE zone_name = @zoneName AND zone_id != @zoneId AND is_deleted = 0
    `;
    
    const existing = await pool
      .request()
      .input("zoneName", sql.NVarChar, zoneName)
      .input("zoneId", sql.Int, zoneId)
      .query(checkQuery);

    if (existing.recordset.length > 0) {
      return res.status(400).json({
        message: "Another zone with this name already exists",
      });
    }

    const updateQuery = `
      UPDATE dbo.zones 
      SET zone_name = @zoneName
      WHERE zone_id = @zoneId AND is_deleted = 0
    `;

    const result = await pool
      .request()
      .input("zoneId", sql.Int, zoneId)
      .input("zoneName", sql.NVarChar, zoneName)
      .query(updateQuery);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        message: "Zone not found or already deleted",
      });
    }

    console.log("Updated zone:", zoneId);
    res.json({ message: "Zone updated successfully" });
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.status = error.status || "error";
    console.log(error.message);
    res.status(error.statusCode).json({
      status: error.statusCode,
      message: "Error updating zone in database",
    });
  }
};

const deleteZone = async (req, res) => {
  console.log("deleteZone");
  const zoneId = req.params.id;
  
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

    // Start a transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Check if zone exists and has any active sensors
      const checkQuery = `
        SELECT COUNT(*) as active_sensors
        FROM dbo.zone_sensors
        WHERE zone_id = @zoneId AND is_deleted = 0
      `;

      const check = await transaction.request()
        .input("zoneId", sql.Int, parseInt(zoneId))
        .query(checkQuery);

      if (check.recordset[0].active_sensors > 0) {
        await transaction.rollback();
        return res.status(400).json({
          message: "Cannot delete zone with active sensors. Please remove or reassign sensors first.",
        });
      }

      // Soft delete the zone
      const deleteQuery = `
        UPDATE dbo.zones 
        SET is_deleted = 1,
            zone_name = CONCAT(zone_name, '_DELETED_', FORMAT(GETDATE(), 'yyyyMMddHHmmss'))
        WHERE zone_id = @zoneId AND is_deleted = 0
      `;

      const result = await transaction.request()
        .input("zoneId", sql.Int, parseInt(zoneId))
        .query(deleteQuery);

      if (result.rowsAffected[0] === 0) {
        await transaction.rollback();
        return res.status(404).json({
          message: "Zone not found or already deleted",
        });
      }

      await transaction.commit();
      console.log("Deleted zone:", zoneId);
      res.json({ message: "Zone deleted successfully" });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.status = error.status || "error";
    console.log(error.message);
    res.status(error.statusCode).json({
      status: error.statusCode,
      message: "Error deleting zone from database",
    });
  }
};

module.exports = {
  getZoneList,
  addNewZone,
  updateZone,
  deleteZone
};