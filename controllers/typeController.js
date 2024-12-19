const { getPool } = require("../pool-manager");
const sql = require("mssql/msnodesqlv8");

const getTypesList = async (req, res) => {
  console.log("getTypesList: ");
  const companyId = req.headers["x-company-id"];
  const companyName = req.headers["x-company-name"];
  
  try {
    if (!companyId || !companyName)
      throw new Error("Missing headers with request");
    
    const pool = await getPool(companyName);
    const query = `
      SELECT DISTINCT type, description
      FROM dbo.base_types
      ORDER BY type
    `;
    
    let results = await pool.request().query(query);
    console.log("Types List:", results.recordsets[0]);
    res.json(results.recordsets[0]);
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.status = error.status || "error";
    console.log(error.message);
    res.status(error.statusCode).json({
      status: error.statusCode,
      message: "Error Requesting Types List from Database",
    });
  }
};

module.exports = {
  getTypesList
};