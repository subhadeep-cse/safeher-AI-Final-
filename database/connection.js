const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI || "mongodb://banerjisubhadeep211_db_user:LR232wD90wHHJggz@ac-dhodqrk-shard-00-00.xxar6z9.mongodb.net:27017,ac-dhodqrk-shard-00-01.xxar6z9.mongodb.net:27017,ac-dhodqrk-shard-00-02.xxar6z9.mongodb.net:27017/safeher?ssl=true&replicaSet=atlas-5kman4-shard-0&authSource=admin&retryWrites=true&w=majority";

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
