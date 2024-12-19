require('dotenv').config();

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.CORS_ORIGIN,
      "https://dash.icespyonline.com",
      "https://gateway.icespyonline.com"
    ];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log("Blocked CORS for origin:", origin);
      callback(new Error(`${origin} is not allowed by CORS`));
    }
  },
  methods: ["GET", "PATCH", "DELETE", "POST", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "x-company-id",
    "x-company-name",
    "x-company-id",
    "x-company-name",
    "Authorization",
    "x-csrf-token",
    "X-Requested-With",
    "Accept"
  ],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400 // 24 hours
};

module.exports = {
  corsOptions,
};
