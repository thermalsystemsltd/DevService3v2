const { getPool } = require("../pool-manager");
const sql = require("mssql/msnodesqlv8");
const bcrypt = require('bcryptjs');

const getUserList = async (req, res) => {
  console.log("getUserList");
  try {
    const companyId = req.headers["x-company-id"];
    const companyName = req.headers["x-company-name"];

    if (!companyId || !companyName) {
      throw new Error("Missing headers with request");
    }

    const pool = await getPool(companyName);
    const query = `
      SELECT 
        DISTINCT
        u.id AS id,
        u.email AS email,
        u.created_at AS created_at,
        u.last_login AS last_login,
        STUFF(
          (SELECT ',' + CAST(role_id AS VARCHAR(10))
           FROM dbo.user_roles ur2
           WHERE ur2.user_id = u.id
           FOR XML PATH('')),
          1, 1, ''
        ) AS roles
      FROM dbo.users u
      LEFT JOIN dbo.user_roles ur ON u.id = ur.user_id
      WHERE u.is_deleted = 0
      ORDER BY u.email
    `;

    let results = await pool.request().query(query);
    console.log("Users:", results.recordsets[0]);
    
    // Transform the results to ensure roles is null when no roles exist
    const transformedResults = results.recordsets[0].map(user => ({
      ...user,
      roles: user.roles || null
    }));
    
    res.json(transformedResults);
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.status = error.status || "error";
    console.log(error.message);
    res.status(error.statusCode).json({
      status: error.statusCode,
      message: "Error retrieving users from database",
    });
  }
};

const createUser = async (req, res) => {
  console.log("createUser");
  const { email, password, roles } = req.body;

  try {
    const companyId = req.headers["x-company-id"];
    const companyName = req.headers["x-company-name"];

    if (!companyId || !companyName) {
      throw new Error("Missing headers with request");
    }
    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    const pool = await getPool(companyName);

    // Check for existing user
    const checkQuery = `
      SELECT 1 FROM dbo.users 
      WHERE email = @email AND is_deleted = 0
    `;

    const existing = await pool
      .request()
      .input("email", sql.NVarChar, email)
      .query(checkQuery);

    if (existing.recordset.length > 0) {
      return res.status(400).json({
        message: "User with this email already exists",
      });
    }
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Start transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Insert user
      const insertUserQuery = `
        INSERT INTO dbo.users (email, hashed_password, created_at, is_deleted)
        OUTPUT INSERTED.id
        VALUES (@email, @hashedPassword, GETDATE(), 0)
      `;

      const userResult = await transaction.request()
        .input("email", sql.NVarChar, email)
        .input("hashedPassword", sql.NVarChar, hashedPassword)
        .query(insertUserQuery);

      const userId = userResult.recordset[0].id;

      // Insert user roles if provided
      if (roles && Array.isArray(roles) && roles.length > 0) {
        const insertRolesQuery = `
          INSERT INTO dbo.user_roles (user_id, role_id)
          VALUES (@userId, @roleId)
        `;

        for (const roleId of roles) {
          await transaction.request()
            .input("userId", sql.Int, userId)
            .input("roleId", sql.Int, roleId)
            .query(insertRolesQuery);
        }
      }

      await transaction.commit();
      console.log("Created user:", { email, userId });
      res.status(201).json({ 
        message: "User created successfully",
        userId: userId 
      });
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
      message: "Error creating user",
    });
  }
};

const deleteUser = async (req, res) => {
  console.log("deleteUser");
  const userId = req.params.id;

  try {
    const companyId = req.headers["x-company-id"];
    const companyName = req.headers["x-company-name"];

    if (!companyId || !companyName) {
      throw new Error("Missing headers with request");
    }
    if (!userId || isNaN(userId)) {
      throw new Error("Valid user ID is required");
    }

    const pool = await getPool(companyName);

    // Start transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Delete user roles
      const deleteRolesQuery = `
        DELETE FROM dbo.user_roles
        WHERE user_id = @userId
      `;

      await transaction.request()
        .input("userId", sql.Int, parseInt(userId))
        .query(deleteRolesQuery);

      // Soft delete user
      const deleteUserQuery = `
        UPDATE dbo.users 
        SET is_deleted = 1,
            email = CONCAT(email, '_DELETED_', FORMAT(GETDATE(), 'yyyyMMddHHmmss'))
        WHERE id = @userId AND is_deleted = 0
      `;

      const result = await transaction.request()
        .input("userId", sql.Int, parseInt(userId))
        .query(deleteUserQuery);

      if (result.rowsAffected[0] === 0) {
        await transaction.rollback();
        return res.status(404).json({
          message: "User not found or already deleted",
        });
      }

      await transaction.commit();
      console.log("Deleted user:", userId);
      res.json({ message: "User deleted successfully" });
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
      message: "Error deleting user",
    });
  }
};

const updateUser = async (req, res) => {
  console.log("updateUser");
  const userId = req.params.id;
  const { email } = req.body;

  try {
    const companyId = req.headers["x-company-id"];
    const companyName = req.headers["x-company-name"];

    if (!companyId || !companyName) {
      throw new Error("Missing headers with request");
    }
    if (!userId || !email) {
      throw new Error("User ID and email are required");
    }

    const pool = await getPool(companyName);

    // Check if email is already in use by another user
    const checkQuery = `
      SELECT 1 FROM dbo.users
      WHERE email = @email AND id != @userId AND is_deleted = 0
    `;

    const existing = await pool
      .request()
      .input("email", sql.NVarChar, email)
      .input("userId", sql.Int, parseInt(userId))
      .query(checkQuery);

    if (existing.recordset.length > 0) {
      return res.status(400).json({
        message: "Email address is already in use",
      });
    }

    const updateQuery = `
      UPDATE dbo.users 
      SET email = @email
      WHERE id = @userId AND is_deleted = 0
    `;

    const result = await pool
      .request()
      .input("userId", sql.Int, parseInt(userId))
      .input("email", sql.NVarChar, email)
      .query(updateQuery);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        message: "User not found or already deleted",
      });
    }

    console.log("Updated user:", { id: userId, email });
    res.json({ message: "User updated successfully" });
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.status = error.status || "error";
    console.log(error.message);
    res.status(error.statusCode).json({
      status: error.statusCode,
      message: "Error updating user",
    });
  }
};

module.exports = {
  getUserList,
  createUser,
  deleteUser,
  updateUser
};