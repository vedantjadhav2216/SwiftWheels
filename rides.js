const mongoose = require('mongoose');

// This defines the structure AND enables automatic timestamps
const rideSchema = new mongoose.Schema({
    driver: String,
    from: String,
    to: String,
    seats: Number
}, { timestamps: true }); 

// Create and export the model
module.exports = mongoose.model('Ride', rideSchema);