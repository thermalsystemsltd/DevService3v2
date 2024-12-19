const pm = require("./pool-manager");
const routes = require("./routes/routes");
const http = require("http"); // Ensure HTTP is correctly imported
const socketIo = require("socket.io");
var express = require("express");
var cors = require("cors");
const liveDataOperations = require("./controllers/dataWebSocketController");
const { corsOptions } = require("./corsConfig"); // Ensure this is correctly imported

//setup ap and router
var app = express();
var server = http.createServer(app);

const whitelist = [
  "https://dash.icespyonline.com",
  "https://gateway.icespyonline.com",
];
// const corsOptions = {
//   credentials: true,
//   origin: (origin, callback) => {
//     if (whitelist.includes(origin)) {
//       return callback(null, true);
//     }
//     callback(new Error(`${origin} Not allowed by CORS`));
//   },
//   methods: ["GET", "POST", "PATCH", "DELETE"],
//   allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token"],
//   exposedHeaders: ["*", "Authorization"],
// };

//establish app uses
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Handle CORS preflight and regular requests 
app.use((req, res, next) => {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    // Apply CORS headers for preflight
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
    return cors(corsOptions)(req, res, () => {
      res.status(204).end();
    });
  }
  
  // Handle regular requests
  cors(corsOptions)(req, res, next);
});

// Log incoming requests
app.use("*", (req, res, next) => {
  if (!req.headers.origin) {
    console.log("\nREJECTED:\t", req.originalUrl, "\tfrom:", req.headers.origin);
  } else {
    console.log("\nREQUESTING:\t", req.originalUrl, "\tfrom:", req.headers.origin);
  }
  next();
});

app.use("/service3", routes);

// socketIO setup
const io = socketIo(server, {
  cors: {
    origin: [
      "https://dash.icespyonline.com",
      "https://gateway.icespyonline.com",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
  path: "/service3WebSocket"
});

io.on("connection", (socket) => {
  // Extract headers from the WebSocket upgrade request
  const companyId = socket.handshake.headers["x-company-id"];
  const companyName = socket.handshake.headers["x-company-name"];

  // Store the extracted data in the socket object for later use
  socket.companyId = companyId;
  socket.companyName = companyName;

  console.log("A new Socket.IO client connected.");
  console.log(`Company: ${companyName} (ID: ${companyId})`);

  // Send a welcome message
  socket.emit("welcome", { message: "Connected to the Socket.IO server" });

  socket.on("getLiveTemp", async () => {
    console.log("req for getLiveTemp");
    try {
      const data = await liveDataOperations.getLiveData(socket.companyId, socket.companyName);
      console.log("Data: ", data);
      socket.emit("temperatureUpdate", data);
    } catch (error) {
      console.error(error.message);
      socket.emit("error", "Failed to fetch data");
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket.IO client disconnected.");
  });
});

//app listening on port and setup connection pools
var port = process.env.APP_PORT || 8090;
async function startServer() {
  try {
    await pm.initializeConfig(); // Assuming initializeConfig is async and returns a Promise
    server.listen(port, () => {
      console.log("Data retrieval 'Service3' is running on port: " + port);
      // console.log("Version: " + );
    });
  } catch (error) {
    console.error("Failed to initialize configurations:", error);
  }
}

function closeServer() {
  console.log("Received kill signal, shutting down gracefully");
  pm.closeAll()
    .then(() => {
      console.log("Database connections closed");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Failed to close database connections:", err);
      process.exit(1);
    });
}

// Handle termination signals:
process.on("SIGINT", closeServer); // handle Ctrl+C
process.on("SIGTERM", closeServer); // handle Docker stop or other SIGTERM sends

startServer();