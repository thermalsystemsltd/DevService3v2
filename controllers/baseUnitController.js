const { getPool } = require("../pool-manager");
const sql = require("mssql/msnodesqlv8");

const getBaseUnitList = async (req, res) => {
  console.log("getBaseUnitList: ");
  const companyId = req.headers["x-company-id"]; // Accessing from headers
  const companyName = req.headers["x-company-name"]; // Accessing from headers
  try {
    if (!companyId || !companyName)
      throw new Error("Missing headers with request");
    const pool = await getPool(companyName); //name of connection pool associate with dynamic pull from meta database later
    const query = `
      SELECT 
        bu.name as base_unit_name,
        bu.id,
        bu.serialNo,
        bu.created_at,
        bu.updated_at,
        bu.is_deleted,
        bt.type,
        bt.description
      FROM dbo.base_units bu
      LEFT JOIN dbo.base_types bt ON bu.id = bt.base_id
      WHERE bu.is_deleted = 0
    `;
    let results = await pool.request().query(query);
    console.log("Base Units:", results.recordsets[0]);
    res.json(results.recordsets[0]);
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.status = error.status || "error";
    console.log(error.message);
    res.status(error.statusCode).json({
      status: error.statusCode,
      message: "Error Requesting Base Unit List from Database",
    });
  }
};

const addNewBaseUnit = async (req, res) => {
  console.log("addNewBaseUnit");
  const { baseUnitSerialNo, baseUnitName, typeId } = req.body; // Accessing data from the body
  try {
    const companyId = req.headers["x-company-id"]; // Accessing from headers
    const companyName = req.headers["x-company-name"]; // Accessing from headers

    if (!companyId || !companyName) {
      throw new Error("Missing headers with request");
    }
    if (!baseUnitSerialNo || !baseUnitName || !typeId) {
      throw new Error("Missing data in body");
    }

    const pool = await getPool(companyName); //name of connection pool associate with dynamic pull from meta database later

    const checkQuery = `
      SELECT 1 FROM dbo.base_units
      WHERE (serialNo = @baseUnitSerialNo OR name = @baseUnitName) AND is_deleted = 0
    `;
    const existing = await pool
      .request()
      .input("baseUnitSerialNo", baseUnitSerialNo)
      .input("baseUnitName", baseUnitName)
      .query(checkQuery);

    if (existing.recordset.length > 0) {
      console.log("Duplicate Found, cancelling Add Req");
      return res.status(400).json({
        message: "Base unit with same serial number or name already exists.",
      });
    }

    // Start a transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Insert base unit
      const insertBaseUnitQuery = `    
      INSERT INTO dbo.base_units (serialNo,name,created_at, is_deleted)
      OUTPUT INSERTED.id
      VALUES (@baseUnitSerialNo,@baseUnitName,GETDATE(),0)
      `;

      const result = await transaction.request()
        .input("baseUnitSerialNo", baseUnitSerialNo)
        .input("baseUnitName", baseUnitName)
        .query(insertBaseUnitQuery);

      const baseUnitId = result.recordset[0].id;

      // Insert base type relation
      const insertBaseTypeQuery = `
      INSERT INTO dbo.base_types (base_id, type, description)
      VALUES (@baseUnitId, @type, @description)
      `;

      await transaction.request()
        .input("baseUnitId", baseUnitId)
        .input("type", sql.NVarChar, typeId)
        .input("description", sql.NVarChar, '')
        .query(insertBaseTypeQuery);

      await transaction.commit();
      console.log("Added Base Unit:", {
        serialNo: baseUnitSerialNo,
        name: baseUnitName,
        type: typeId,
        id: baseUnitId
      });
      res.status(201).json({ message: "New BaseUnit Added" });
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
      message: error.message || "Error Adding Base Unit to Database",
    });
  }
};

const updateBaseUnit = async (req, res) => {
  console.log("updateBaseUnit");
  const { baseUnitId, baseUnitName } = req.body; // Accessing data from the body
  try {
    const companyId = req.headers["x-company-id"]; // Accessing from headers
    const companyName = req.headers["x-company-name"]; // Accessing from headers

    if (!companyId || !companyName) {
      throw new Error("Missing headers with request");
    }
    if (!baseUnitId || !baseUnitName) {
      throw new Error("Missing data in body");
    }

    const pool = await getPool(companyName);

    const checkQuery = `
      SELECT 1 FROM dbo.base_units
      WHERE (name = @baseUnitName) AND is_deleted = 0
    `;
    const existing = await pool
      .request()
      .input("baseUnitName", baseUnitName)
      .query(checkQuery);

    if (existing.recordset.length > 0) {
      console.log("Duplicate Found, cancelling Update Req");
      return res.status(400).json({
        message: "Base unit with same serial number or name already exists.",
      });
    }

    const query = `
    UPDATE dbo.base_units 
    SET name = @baseUnitName, 
    updated_at = GETDATE()
    WHERE id = @baseUnitId
    `;

    let results = await pool
      .request()
      .input("baseUnitName", sql.NVarChar, baseUnitName)
      .input("baseUnitId", sql.Int, baseUnitId)
      .query(query);
    console.log("Updated Base Unit:", {
      id: baseUnitId,
      newName: baseUnitName
    });
    res.json(results.recordsets[0]);
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.status = error.status || "error";
    console.log(error.message);
    res.status(error.statusCode).json({
      status: error.statusCode,
      message: "Error Updating Base Unit List in Database",
    });
  }
};

const deleteBaseUnit = async (req, res) => {
  console.log("deleteBasuUnit");
  const { baseUnitId } = req.body; // Accessing data from the body
  try {
    const companyId = req.headers["x-company-id"]; // Accessing from headers
    const companyName = req.headers["x-company-name"]; // Accessing from headers

    if (!companyId || !companyName) {
      throw new Error("Missing headers with request");
    }
    if (!baseUnitId) {
      throw new Error("Missing data in body");
    }

    const pool = await getPool(companyName); //name of connection pool associate with dynamic pull from meta database later

    const query = `
    UPDATE dbo.base_units 
    SET is_deleted = 1, 
        updated_at = GETDATE()
    WHERE id = @baseUnitId
    `;

    // Start a transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Delete base type relations
      const deleteBaseTypeQuery = `
      DELETE FROM dbo.base_types
      WHERE base_id = @baseUnitId
      `;

      await transaction.request()
        .input("baseUnitId", sql.Int, baseUnitId)
        .query(deleteBaseTypeQuery);

      // Soft delete base unit
      await transaction.request()
        .input("baseUnitId", sql.Int, baseUnitId)
        .query(query);

      await transaction.commit();
      console.log("Deleted Base Unit:", {
        id: baseUnitId,
        status: "Soft deleted with type relations removed"
      });
      res.status(201).json({ message: "BaseUnit Removed" });
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
      message: "Error Deleting Base Unit from Database",
    });
  }
};

module.exports = {
  getBaseUnitList: getBaseUnitList,
  addNewBaseUnit: addNewBaseUnit,
  updateBaseUnit: updateBaseUnit,
  deleteBaseUnit: deleteBaseUnit,
};
