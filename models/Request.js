const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride' },
    passenger: { type: String, required: true },
    passengerPhone: { type: String, default: "Not set" }, // Added for easy contact
    driver: { type: String, required: true },
    status: { type: String, default: 'pending' }, // pending, accepted, rejected
    
    // 📍 NEW: Specific Pickup Spot
    pickupPoint: { type: String, default: "Agreed Location" },
    
    rideDetails: {
        from: String,
        to: String,
        price: Number,
        date: String,
        time: String
    }
});

module.exports = mongoose.model('Request', requestSchema);