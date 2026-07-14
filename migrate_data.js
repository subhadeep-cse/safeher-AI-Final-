const mongoose = require('mongoose');
const fs = require('fs');
const CommunityReport = require('./models/CommunityReport');
require('dotenv').config();

const MONGODB_URI = "mongodb://banerjisubhadeep211_db_user:LR232wD90wHHJggz@ac-dhodqrk-shard-00-00.xxar6z9.mongodb.net:27017,ac-dhodqrk-shard-00-01.xxar6z9.mongodb.net:27017,ac-dhodqrk-shard-00-02.xxar6z9.mongodb.net:27017/safeher?ssl=true&replicaSet=atlas-5kman4-shard-0&authSource=admin&retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI)
  .then(async () => {
      console.log("Connected to MongoDB for migration.");
      
      try {
          const rawData = fs.readFileSync('./reports.json', 'utf8');
          const reports = JSON.parse(rawData);
          
          let count = 0;
          for (const report of reports) {
              const exists = await CommunityReport.findOne({ id: report.id });
              if (!exists) {
                  const newDoc = new CommunityReport(report);
                  await newDoc.save();
                  count++;
              }
          }
          console.log(`Successfully migrated ${count} reports to MongoDB.`);
      } catch (err) {
          console.error("Failed during migration:", err.message);
      }
      
      process.exit(0);
  })
  .catch(err => {
      console.error("MongoDB connection failed:", err.message);
      process.exit(1);
  });
