const mongoose = require('mongoose');

const EvidenceVaultSchema = new mongoose.Schema({
    id: { type: String, required: true, default: () => Date.now().toString() },
    reason: { type: String, required: true },
    audioUrl: { type: String }, // optional, for recordings
    locData: {
        lat: { type: Number },
        lon: { type: Number },
        accuracy: { type: Number },
        speed: { type: Number },
        heading: { type: Number }
    },
    timestamp: { type: Date, default: Date.now }
}, {
    timestamps: true
});

module.exports = mongoose.model('EvidenceVault', EvidenceVaultSchema);
