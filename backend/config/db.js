const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // give up if the database does not answer (Atlas can need a few seconds the first time)
      serverSelectionTimeoutMS: Number(process.env.DB_TIMEOUT_MS) || 15000
    });
    console.log(`✅ MongoDB Connected Successfully: ${conn.connection.host}`);
  } catch (error) {
    console.error(` MongoDB Connection Error: ${error.message}`);
    console.error("👉 Check MONGODB_URI. For Atlas: the database user and password are right, and Network Access allows your server's IP (or 0.0.0.0/0 while testing).");
    process.exit(1); 
  }
};

module.exports = connectDB;