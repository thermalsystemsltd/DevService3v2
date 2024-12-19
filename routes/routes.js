const express = require("express");
const router = express.Router();
const dataOperations = require("../controllers/dataController");
const baseUnitOperations = require("../controllers/baseUnitController");
const sensorOperations = require("../controllers/sensorController");
const typeOperations = require("../controllers/typeController");
const zoneOperations = require("../controllers/zoneController");
const zoneSensorOperations = require("../controllers/zoneSensorController");
const userOperations = require("../controllers/userController");

router.route("/getDailyChartData/").get(dataOperations.getDailyChartData);
router.route("/getLiveData/").get(dataOperations.getLiveData);

router
  .route("/baseUnits")
  .get(baseUnitOperations.getBaseUnitList)
  .post(baseUnitOperations.addNewBaseUnit)
  .patch(baseUnitOperations.updateBaseUnit)
  .delete(baseUnitOperations.deleteBaseUnit);

router.route("/types").get(typeOperations.getTypesList);

router
  .route("/sensors")
  .get(sensorOperations.getSensorList)
  .post(sensorOperations.addNewSensor);

router
  .route("/sensors/:id")
  .patch(sensorOperations.updateSensor)
  .delete(sensorOperations.deleteSensor);

router
  .route("/zones")
  .get(zoneOperations.getZoneList)
  .post(zoneOperations.addNewZone)
  .patch(zoneOperations.updateZone);

router
  .route("/zones/:id")
  .delete(zoneOperations.deleteZone);

router
  .route("/zones/:zoneId/sensors")
  .get(zoneSensorOperations.getZoneSensors)
  .post(zoneSensorOperations.assignSensorToZone);

router
  .route("/zones/:zoneId/sensors/:sensorId")
  .delete(zoneSensorOperations.removeSensorFromZone);

router
  .route("/users")
  .get(userOperations.getUserList)
  .post(userOperations.createUser);
  
router
  .route("/users/:id")
  .patch(userOperations.updateUser)
  .delete(userOperations.deleteUser);

router.use("*", (req, res) => {
  // console.log("a request was made");
  if(!res.headersSent){
    res
      .status(502)
      .send(
        "Bad Gateway: Unable to connect to the target server \n Error msg from Servicec API"
      );
  }
});

module.exports = router;
// router.route("/calibrationData/:grid").get((request, response) => {
//   console.log("Calibration Data");
//   operations.getCalibrationData(request.params.grid).then((results) => {
//     response.json(results);
//   });
// });

// router.route("/calibrationProbes/:grid").get((request, response) => {
//   console.log("Calibration Probes: " + request.params.grid);
//   operations.getCalibrationProbes(request.params.grid).then((results) => {
//     response.json(results);
//   });
// });

// router.route("/getLiveData/:serialNo/:date").get((request, response) => {
//   console.log("Live Data: " + request.params.serialNo, request.params.date);
//   operations
//     .getLiveData(request.params.serialNo, request.params.date)
//     .then((results) => {
//       response.json(results);
//     });
// });
// router
//   .route("/getRetroTest/:serialNo/:date/:endDate")
//   .get((request, response) => {
//     console.log("Live Data: " + request.params.serialNo, request.params.date);
//     operations
//       .getRetroTest(
//         request.params.serialNo,
//         request.params.date,
//         request.params.endDate
//       )
//       .then((results) => {
//         response.json(results);
//       });
//   });

// router
//   .route("/getRetroData/:serialNo/:startDateTime/:endDateTime")
//   .get((request, response) => {
//     console.log(
//       "Retro Data: " + request.params.serialNo,
//       request.params.startDateTime,
//       request.params.endDateTime
//     );
//     operations
//       .getRetroData(
//         request.params.serialNo,
//         request.params.startDateTime,
//         request.params.endDateTime
//       )
//       .then((results) => {
//         response.json(results);
//       });
//   });

// router.route("/getCompanyList/").get((request, response) => {
//   try {
//     response.json(pm.getCompanyList(request.params.serialNo));
//   } catch (error) {
//     error.statusCode = error.statusCode || 500;
//     error.status = error.status || "error";
//     console.log(error.message);
//     response.status(error.statusCode).json({
//       status: error.statusCode,
//       message: "Error Requesting Data from Database",
//     });
//   }
// });

// router.route("/getRetroTest/:serialNo").get((request, response) => {
//   operations.getRetroTest(request.params.serialNo,request.params.startDateTime).then((results) => {
//     response.json(results);
//   });
// });

// router.route("/getEngineerList/").get((request, response) => {
//   operations.getEngineerList().then((results) => {
//     response.json(results);
//   });
// });

// router.route("/getGridList/").get((request, response) => {
//   try {
//     operations.getGridList().then((results) => {
//       response.json(results);
//     });
//   } catch (error) {
//     error.statusCode = error.statusCode || 500;
//     error.status = error.status || "error";
//     console.log(error.message);
//     response.status(error.statusCode).json({
//       status: error.statusCode,
//       message: "Error Requesting Data from Database",
//     });
//   }
// });
