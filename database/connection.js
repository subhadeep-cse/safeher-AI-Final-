const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            console.warn("⚠️ MONGODB_URI is not defined in the environment variables.");
            return false;
        }

        await mongoose.connect(uri);
        console.log("✅ Successfully connected to MongoDB Atlas");
        return true;
    } catch (err) {
        console.error("❌ Failed to connect to MongoDB Atlas:", err.message);
        // Do not crash the app, return false to indicate failure
        return false;
    }
};

module.exports = connectDB;
