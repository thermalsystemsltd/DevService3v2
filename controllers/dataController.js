const { getPool } = require("../pool-manager");

const getLiveData = async (req, res) => {
  console.log("getLiveData");
  try {
    const companyId = req.headers["x-company-id"];
    const companyName = req.headers["x-company-name"];

    if (!companyId || !companyName) {
      throw new Error("Missing headers with request");
    }

    const pool = await getPool(companyName);

    const query = `
      SELECT 
        s.serialNo AS sensor_id,
        s.name AS sensor_name,
        s.type,
        sd.temperature,
        sd.RSSI,
        sd.SNR,
        sd.Battery,
        sd.created_at AS timestamp
      FROM sensors s
      JOIN (
        SELECT 
          sensor_id,
          temperature,
          RSSI,
          SNR,
          Battery,
          created_at,
          ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY created_at DESC) as rn
        FROM sensor_data
      ) sd ON s.serialNo = sd.sensor_id AND sd.rn = 1
      WHERE s.is_deleted = 0;
    `;

    let results = await pool.request().query(query);
    console.log("Live Data: ", results.recordsets[0]);
    res.json(results.recordsets[0]);
  } catch (error) {
    error.statusCode = error.statusCode || 500;
    error.status = error.status || "error";
    console.error(error.message);
    res.status(error.statusCode).json({
      message: "Error Requesting Live Data from Database",
    });
  }
};

const getDailyChartData = async (req, res) => {
  console.log("getDailyChartData");
  try {
    const companyId = req.headers["x-company-id"]; // Accessing from headers
    const companyName = req.headers["x-company-name"]; // Accessing from headers

    if (!companyId || !companyName) {
      throw new Error("Missing headers with request");
    }

    const pool = await getPool(companyName); //name of connection pool associate with dynamic pull from meta database later

    // 'yyyy-MM-ddTHH:00:00' ISO 8601 Standard Time
    const query = `
    SELECT 
      sensor_id as sensorID,
      FORMAT(log_datetime,  'yyyy-MM-ddTHH:00:00') AS hourlyTimestamp, 
      ROUND(AVG(temperature), 2) AS avgTemp,
      ROUND(MIN(temperature), 2) AS minTemp,
      ROUND(MAX(temperature), 2) AS maxTemp
    FROM 
      dbo.sensor_data
    WHERE 
      log_datetime >= DATEADD(hour, -24, GETDATE())
    GROUP BY 
      sensor_id,
      FORMAT(log_datetime, 'yyyy-MM-ddTHH:00:00')
    ORDER BY 
      sensorID,
      hourlyTimestamp
    `;
    
    let results = await pool.request().query(query);
    // console.log("Probe Data: ", results.recordsets[0]);
    const processedData = processAggregateData(results.recordsets[0]);
    // console.log("processedData: ", processedData);
    if(processedData?.length==0) console.log("No data")
    res.json(processedData);
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
  getDailyChartData: getDailyChartData,
  getLiveData: getLiveData,
};

const processAggregateData = (rows) => {
  const result = {};
  rows.forEach((row) => {
    const sensorId = row.sensorID; // Assuming 'sensorID' is the correct field name
    if (!result[sensorId]) {
      result[sensorId] = { sensorID: sensorId, data: {} };
    }
    result[sensorId].data[row.hourlyTimestamp] = {
      min: row.minTemp,
      max: row.maxTemp,
      avg: row.avgTemp,
    };
  });
  return Object.values(result); // This returns an array of the structured objects
};

// async function getCompanyData(connections) {
//   try {
//     const query = `SELECT company.companyName as "CompanyName" FROM company`;

//     var data = [];
//     for (const connection of connections) {
//       console.log("get company data: ", connection);
//       const pool = await get(connection);
//       var results = await pool.request().query(query);
//       results.recordsets[0][0].CompanyName = connection;
//       // console.log(results.recordsets[0][0]);
//       data.push(results.recordsets[0][0]);
//     }
//     console.log(data);
//     return data;
//   } catch (err) {
//     //log error and close connection
//     console.log(err.message);
//   }
// }

//placeholder function pull all sensor data from single database

// async function getGridList() {
//   try {
//     const query = `SELECT grid.gridName as "gridName" FROM grid`;
//     const pool = await get("Calibration"); //name of connection pool
//     let results = await pool.request().query(query);
//     console.log(results.recordsets[0]);
//     return results.recordsets[0];
//   } catch (error) {
//     console.log(error.message);
//     return error;
//   }
// }

// async function getCalibrationData(serialNo) {
//   try {
//     const query = `
//     Select s.sensorSerialNo as 'serialNo' ,s.HardwareSerialNo as'hardwareNo',
//         sd.Channel1_Data as 'temp', sd.captureTime
//     from dbo.sensordata sd
//     Join dbo.sensor s
//     ON sd.Sensor_sensorSerialNo = s.sensorSerialNo
//     Where s.sensorSerialNo = @input_parameter`;
//     const pool = await get("Calibration"); //name of connection pool
//     let results = await pool
//       .request()
//       .input("input_parameter", serialNo)
//       .query(query);
//     console.log(results.recordsets[0]);
//     console.log("Probe Data: ", results.recordsets[0].length);

//     return results.recordsets[0];
//   } catch (error) {
//     console.log(error.message);
//   }
// }

// //return unique list of probe Serial anbd Hardware no
// async function getCalibrationProbes(grid) {
//   try {
//     const query = `SELECT s.sensorSerialNo as 'serialNo', HardwareSerialNo as 'hardwareNo'
//       FROM dbo.gridsensor gs
//       LEFT JOIN dbo.grid g
//       ON gs.idGrid = g.idGrid
//       Join dbo.sensor s
//       ON gs.sensorSerialNo = s.sensorSerialNo
//       WHERE gridName = @input_parameter`; //sample: 'Office sensors'
//     const pool = await get("Calibration"); //name of connection pool
//     let results = await pool
//       .request()
//       .input("input_parameter", grid)
//       .query(query);
//     console.log(results.recordsets[0]);
//     console.log("Probe Results: ", results.recordsets[0].length);
//     return results.recordsets[0];
//   } catch (error) {
//     console.log(error.message);
//   }
// }

// //returns probe data (temp and timeStamp) for specified probe produced after date selected
// // comparison is > date NOT >= to avoid pulling last data again
// async function getLiveData(probeSerialNo, calibrationDate) {
//   try {
//     const query = `SELECT
//       captureTime,
//       channel1_Data as "temp"
//       FROM
//       sensordata
//     WHERE  Sensor_sensorSerialNo = @input_probe
//     AND captureTime > Convert(datetime, @input_date )
//     Order by captureTime DESC
//       `;
//     const pool = await get("Calibration"); //name of connection pool
//     let results = await pool
//       .request()
//       .input("input_probe", probeSerialNo)
//       .input("input_date", calibrationDate)
//       .query(query);
//     console.log(results.recordsets[0]);
//     console.log("Probe Data: ", results.recordsets[0]?.length);
//     return results.recordsets[0];
//   } catch (error) {
//     console.log(error.message);
//   }
// }

// async function getRetroTest(
//   probeSerialNo,
//   calibrationDate,
//   calibrationEndDate
// ) {
//   try {
//     const query = `SELECT
//       captureTime,
//       channel1_Data as "temp"
//       FROM
//       sensordata
//     WHERE  Sensor_sensorSerialNo = @input_probe
//     AND captureTime > Convert(datetime, @input_date )
//     Order by captureTime DESC
//       `;
//     const pool = await get("Calibration"); //name of connection pool
//     let results = await pool
//       .request()
//       .input("input_probe", probeSerialNo)
//       .input("input_date", calibrationDate)
//       .query(query);
//     console.log(results.recordsets[0]);
//     console.log("Probe Data: ", results.recordsets[0]?.length);
//     return results.recordsets[0];
//   } catch (error) {
//     console.log(error.message);
//   }
// }
// async function getRetroData(probeSerialNo, startDateTime, endDateTime) {
//   console.log("getRetroData");
//   try {
//     const query = `SELECT captureTime,
//       channel1_Data as "temp"
//       FROM
//       sensordata
//     WHERE  Sensor_sensorSerialNo = @input_probe
//     AND captureTime > Convert(datetime, @input_start)
//     AND captureTime < Convert(datetime, @input_end)
//     Order by captureTime DESC
//       `;
//     const pool = await get("Calibration"); //name of connection pool
//     let results = await pool
//       .request()
//       .input("input_probe", probeSerialNo)
//       .input("input_start", startDateTime)
//       .input("input_end", endDateTime)
//       .query(query);
//     console.log(results.recordsets[0]);
//     console.log("Probe Data: ", results.recordsets[0]?.length);
//     return results.recordsets[0];
//   } catch (error) {
//     console.log(error.message);
//   }
// }
