const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    
    // 🛡️ AUTH
    isAdmin: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false }, 
    otp: { type: String },

    // 📱 PHONE VERIFICATION (New)
    phone: { type: String, default: "" },
    phoneOtp: { type: String },
    isPhoneVerified: { type: Boolean, default: false },
    
    // 🚗 DRIVER DETAILS
    vehicle: {
        model: { type: String, default: "" },
        plateNumber: { type: String, default: "" }, 
        // 🔒 NEW: Store the Type permanently
        type: { type: String, enum: ['Car', 'Bike'], default: 'Bike' },
        isVerified: { type: Boolean, default: false }
    },

    // ⭐ RATINGS
    rating: { type: Number, default: 5.0 }, 
    reviewCount: { type: Number, default: 0 } 
});

module.exports = mongoose.model('User', userSchema);