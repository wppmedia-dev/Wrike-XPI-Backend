require("dotenv").config();

module.exports = {
  username: process.env.DB_USERNAME,
  password: process.env.DB_SECRET,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  logging: false,
  dialect: "postgres",
  pool: {
    max: parseInt(process.env.DB_POOL_MAX || "20", 10),
    min: parseInt(process.env.DB_POOL_MIN || "0", 10),
    acquire: parseInt(process.env.DB_POOL_ACQUIRE_MS || "30000", 10),
    idle: parseInt(process.env.DB_POOL_IDLE_MS || "10000", 10),
  },
};
