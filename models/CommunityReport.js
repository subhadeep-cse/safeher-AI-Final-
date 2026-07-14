const mongoose = require('mongoose');

const CommunityReportSchema = new mongoose.Schema({
    type: { type: String, required: true },
    typeName: { type: String, required: true },
    loc: { type: String, required: true },
    desc: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
    verifications: { type: Number, default: 0 },
    // We retain the old 'id' format (which was Date.now().toString()) as a field to ensure 100% backward compatibility
    id: { type: String, required: true, default: () => Date.now().toString() }
}, { 
    timestamps: true 
});

module.exports = mongoose.model('CommunityReport', CommunityReportSchema);
