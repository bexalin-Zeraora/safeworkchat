const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Force it to give up after 5 seconds if it can't connect
      serverSelectionTimeoutMS: 5000 
    });
    console.log(`✅ MongoDB Connected Successfully: ${conn.connection.host}`);
  } catch (error) {
    console.error(` MongoDB Connection Error: ${error.message}`);
    console.error("👉 Is MongoDB running? Check your Services or terminal.");
    process.exit(1); 
  }
};

module.exports = connectDB;