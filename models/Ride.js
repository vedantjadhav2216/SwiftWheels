const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
    driver: { type: String, required: true },
    driverUsername: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    
    // 📍 FIX 1: STORE EXACT COORDINATES
    fromLat: { type: Number },
    fromLon: { type: Number },
    toLat: { type: Number },
    toLon: { type: Number },

    // ⏱️ FIX 2: TIME-BASED TRACKING
    startTime: { type: Date }, // When did the driver click "Start"?
    // 🔴 NEW: LIVE LOCATION FIELDS (Add these lines)
    // These store where the driver is RIGHT NOW
    currentLat: { type: Number },
    currentLon: { type: Number },
    // 📍 NEW: List of places the driver passes through
    stops: { type: [String], default: [] }, 
    
    seats: { type: Number, required: true },
    price: { type: Number, required: true },
    travelDate: { type: String, required: true },
    travelTime: { type: String, required: true },
    vehicleType: { type: String },
    vehicleModel: { type: String },

    paymentStatus: { type: String, default: 'pending' }, // 'pending' or 'paid'
    
    status: { type: String, default: 'scheduled' }
});

module.exports = mongoose.model('Ride', rideSchema);