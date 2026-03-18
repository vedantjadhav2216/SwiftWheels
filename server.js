const Request = require('./models/Request');
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const Ride = require('./models/Ride');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const User = require('./models/User');

const app = express();
app.use(express.static('public')); // Serve frontend files
app.use(express.json());

// DATABASE CONNECTION
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🚀 Success: Connected to MongoDB!"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// EMAIL CONFIG
// EMAIL CONFIG (Updated for Better Reliability)
const transporter = nodemailer.createTransport({
   service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
});

// TEST CONNECTION ON STARTUP
transporter.verify(function (error, success) {
    if (error) {
        console.log("❌ Email Server Error:", error);
    } else {
        console.log("✅ Email Server is Ready to Send Messages");
    }
});
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ==========================
// 🏠 BASIC ROUTES
// ==========================
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/admin', (req, res) => res.sendFile(__dirname + '/admin.html')); // 🆕 Admin Page

// ==========================
// 👤 USER & AUTH ROUTES
// ==========================

// 1. REGISTER
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, username, password, email } = req.body;
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) return res.status(400).json({ error: "User or Email already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = generateOTP();
        
        // 🆕 Auto-make 'admin' user an Admin
        const isAdmin = username.toLowerCase() === 'admin';

        const newUser = new User({ 
            fullName, username, email, password: hashedPassword, 
            otp, otpExpires: Date.now() + 600000, isVerified: false,
            isAdmin // <--- Set Admin status
        });
        
        await newUser.save();
        await transporter.sendMail({
            to: email, subject: 'Verify SwiftWheels', 
            text: `Your OTP is: ${otp}`
        });
        res.json({ message: "OTP sent!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. VERIFY
app.post('/api/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const user = await User.findOne({ email });
        if (!user || user.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });

        user.isVerified = true; user.otp = undefined;
        await user.save();
        res.json({ message: "Verified!" });
    } catch (err) { res.status(500).json({ error: "Error verifying" }); }
});

// 3. LOGIN (Returns Admin Status & Phone)
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || !user.isVerified) return res.status(400).json({ error: "Invalid User or Unverified" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Wrong Password" });

        res.json({ 
            message: "Login Success", 
            user: { 
                username: user.username, 
                fullName: user.fullName, 
                isAdmin: user.isAdmin,
                phone: user.phone // <--- Send phone to frontend
            } 
        });
    } catch (err) { res.status(500).json({ error: "Login failed" }); }
});

// 4. 🆕 UPDATE PROFILE (Save Phone)
app.post('/api/user/update', async (req, res) => {
    try {
        const { username, phone } = req.body;
        const user = await User.findOneAndUpdate({ username }, { phone }, { new: true });
        res.json({ message: "Profile Updated", user });
    } catch (err) { res.status(500).json({ error: "Update failed" }); }
});

// ==========================
// 🚗 RIDE ROUTES
// ==========================
// GET RIDES (With Driver Ratings)
app.get('/api/rides', async (req, res) => {
    const rides = await Ride.find();
    // We need to fetch driver details for each ride to get the rating
    // This is an advanced technique called "Manual Population"
    const enrichedRides = await Promise.all(rides.map(async (ride) => {
        const driver = await User.findOne({ username: ride.driverUsername });
        return {
            ...ride._doc,
            driverRating: driver ? driver.rating : 5.0,
            driverReviews: driver ? driver.reviewCount : 0
        };
    }));

    res.json(enrichedRides);
});

// 🔍 SMART SEARCH (Checks Start, End, AND Stops)
app.get('/api/rides/search', async (req, res) => {
    try {
        const { to } = req.query; // This is the user's search term (e.g. "Jatra")
        if (!to) return res.json([]);

        // Regex for flexible matching (case insensitive)
        const regex = new RegExp(to, 'i');

        const rides = await Ride.find({
            $or: [
                { from: regex },
                { to: regex },
                { stops: { $in: [regex] } } // Check if "Jatra" is in the stops list
            ],
            status: 'scheduled', // Only show active rides
            seats: { $gt: 0 }    // Only show rides with seats
        });

        // Add Driver Rating Logic (Manual Population)
        const enrichedRides = await Promise.all(rides.map(async (ride) => {
            const driver = await User.findOne({ username: ride.driverUsername });
            return {
                ...ride._doc,
                driverRating: driver ? driver.rating : 5.0,
                driverReviews: driver ? driver.reviewCount : 0
            };
        }));

        res.json(enrichedRides);
    } catch (err) { res.status(500).json({ error: "Search failed" }); }
});

app.post('/api/rides', async (req, res) => {
    try {
        // 1. Get the driver's full profile to check verification
        const user = await User.findOne({ username: req.body.driverUsername }); // We will send driverUsername now
        
        // 🛑 SECURITY CHECK
        if (!user || !user.vehicle || !user.vehicle.isVerified) {
            return res.status(403).json({ error: "⛔ You must have a Verified Vehicle to post rides." });
        }

        const newRide = new Ride(req.body);
        await newRide.save();
        res.status(201).json({ message: "Ride Posted", ride: newRide });
    } catch (err) { res.status(400).json({ error: "Error posting ride" }); }
});

app.delete('/api/rides/:id', async (req, res) => {
    await Ride.findByIdAndDelete(req.params.id);
    res.json({ message: "Ride Deleted" });
});

// 🚦 DRIVER: UPDATE RIDE STATUS (Start/End)
app.post('/api/rides/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        
        let updateData = { status };
        // If starting, save the current time
        if(status === 'started') {
            updateData.startTime = new Date();
        }

        await Ride.findByIdAndUpdate(req.params.id, updateData);
        res.json({ message: `Ride ${status}` });
    } catch (err) { res.status(500).json({ error: "Update failed" }); }
});

// 📍 UPDATE LIVE LOCATION (Driver sends this)
app.post('/api/rides/:id/location', async (req, res) => {
    try {
        const { lat, lon } = req.body;
        // Update the ride with the new "current" coordinates
        await Ride.findByIdAndUpdate(req.params.id, { 
            currentLat: lat, 
            currentLon: lon 
        });
        res.json({ message: "Location updated" });
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

// 🔍 GET LIVE LOCATION (Passenger reads this)
app.get('/api/rides/:id/location', async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.id);
        if(!ride) return res.status(404).json({ error: "Ride not found" });
        
        res.json({ 
            lat: ride.currentLat, 
            lon: ride.currentLon,
            status: ride.status 
        });
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

// ==========================
// 📬 REQUEST SYSTEM (With Phone Logic)
// ==========================

// 1. CREATE REQUEST (Fetch Passenger Phone)
// REQUEST A RIDE (Now includes Pickup Point)
app.post('/api/requests', async (req, res) => {
    try {
        const { rideId, passenger, driver, rideDetails, pickupPoint } = req.body;
        
        // Fetch passenger phone for convenience
        const userObj = await User.findOne({ username: passenger });
        const passengerPhone = userObj ? userObj.phone : "Not set";

        const newReq = new Request({ 
            rideId, passenger, driver, rideDetails, 
            passengerPhone, pickupPoint // <--- Save it
        });
        await newReq.save();
        res.status(201).json({ message: "Request Sent" });
    } catch (err) { res.status(400).json({ error: "Error requesting" }); }
});

// 2. GET DRIVER REQUESTS
app.get('/api/requests/driver/:username', async (req, res) => {
    const requests = await Request.find({ driver: req.params.username, status: 'pending' });
    res.json(requests);
});

// 3. GET PASSENGER REQUESTS
app.get('/api/requests/passenger/:username', async (req, res) => {
    const requests = await Request.find({ passenger: req.params.username });
    res.json(requests);
});

// 🔍 SMART FETCH: Find requests by Full Name or Username
app.get('/api/requests/driver/:name', async (req, res) => {
    try {
        const name = req.params.name;
        const requests = await Request.find({ 
            driver: name, // Matches the String "fullName" sent from frontend
            status: 'pending' 
        });
        res.json(requests);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch requests" });
    }
});

// 4. ACCEPT/REJECT (Share Driver Phone on Accept)
app.post('/api/requests/:id/:action', async (req, res) => {
    try {
        const { id, action } = req.params;
        const reqItem = await Request.findById(id);
        if (!reqItem) return res.status(404).json({ error: "Not found" });

        if (action === 'reject') {
            reqItem.status = 'rejected';
            await reqItem.save();
            return res.json({ message: "Rejected" });
        }

        if (action === 'accept') {
            const ride = await Ride.findById(reqItem.rideId);
            if (!ride || ride.seats <= 0) return res.status(400).json({ error: "Full" });

            // Get Driver Phone
            const dUser = await User.findOne({ username: reqItem.driver });
            const driverPhone = dUser ? dUser.phone : "Not set";

            ride.seats -= 1;
            await ride.save();

            reqItem.status = 'accepted';
            reqItem.driverPhone = driverPhone; // <--- Save Driver Phone
            await reqItem.save();
            return res.json({ message: "Accepted" });
        }
    } catch (err) { res.status(500).json({ error: "Action failed" }); }
});

app.post('/api/requests/:id/cancel', async (req, res) => {
    try {
        const reqItem = await Request.findById(req.params.id);
        if (reqItem.status === 'accepted') {
            const ride = await Ride.findById(reqItem.rideId);
            if(ride) { ride.seats += 1; await ride.save(); }
        }
        reqItem.status = 'cancelled';
        await reqItem.save();
        res.json({ message: "Cancelled" });
    } catch (err) { res.status(500).json({ error: "Error" }); }
});

// 🚗 DRIVER: Register Vehicle
// 🚗 DRIVER: Register Vehicle (Now includes TYPE)
app.post('/api/user/vehicle', async (req, res) => {
    try {
        const { username, model, plateNumber, type } = req.body; // <--- Get Type
        
        const user = await User.findOneAndUpdate(
            { username }, 
            { 
                vehicle: { 
                    model, 
                    plateNumber, 
                    type, // <--- Save Type
                    isVerified: false 
                } 
            }, 
            { new: true }
        );
        res.json({ message: "Vehicle details submitted!", user });
    } catch (err) { res.status(500).json({ error: "Update failed" }); }
});

// 🛡️ ADMIN: Approve Vehicle
app.post('/api/admin/verify-vehicle', async (req, res) => {
    try {
        const { username } = req.body;
        const user = await User.findOne({ username });
        if(user) {
            user.vehicle.isVerified = true;
            await user.save();
            res.json({ message: "Vehicle Approved!" });
        } else {
            res.status(404).json({ error: "User not found" });
        }
    } catch (err) { res.status(500).json({ error: "Error verifying" }); }
});

// 🛑 ADMIN: Reject Vehicle (Resets data so user must resubmit)
app.post('/api/admin/reject-vehicle', async (req, res) => {
    try {
        const { username } = req.body;
        // Reset vehicle fields to empty
        await User.findOneAndUpdate(
            { username },
            { vehicle: { model: "", plateNumber: "", isVerified: false } }
        );
        res.json({ message: "Vehicle Rejected & Reset" });
    } catch (err) { res.status(500).json({ error: "Error rejecting" }); }
});

// 🔄 GET FRESH USER DATA (Fixes the missing badge issue)
app.get('/api/user/me/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if(!user) return res.status(404).json({ error: "User not found" });
        res.json({ user });
    } catch (err) { res.status(500).json({ error: "Server Error" }); }
});

// ==========================
// 🛡️ ADMIN PANEL ROUTES (New!)
// ==========================
app.get('/api/admin/stats', async (req, res) => {
    const userCount = await User.countDocuments();
    const rideCount = await Ride.countDocuments();
    const reqCount = await Request.countDocuments();
    res.json({ userCount, rideCount, reqCount });
});

app.get('/api/admin/users', async (req, res) => {
    const users = await User.find({}, '-password -otp'); // Don't show passwords
    res.json(users);
});

app.delete('/api/admin/users/:id', async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    // Also delete their rides to keep DB clean
    await Ride.deleteMany({ driver: { $ne: null } }); // Simplified cleanup
    res.json({ message: "User Banned" });
});

// ⭐ RATE A USER
app.post('/api/user/rate', async (req, res) => {
    try {
        const { username, stars } = req.body; // stars = 1 to 5
        const user = await User.findOne({ username });
        
        if (!user) return res.status(404).json({ error: "User not found" });

        // Calculate new average
        // Formula: ((Old Rating * Old Count) + New Stars) / (Old Count + 1)
        const currentTotal = user.rating * user.reviewCount;
        const newCount = user.reviewCount + 1;
        const newRating = (currentTotal + stars) / newCount;

        user.rating = newRating.toFixed(1); // Keep 1 decimal (e.g. 4.7)
        user.reviewCount = newCount;
        
        await user.save();
        res.json({ message: "Rating submitted!", newRating: user.rating });
    } catch (err) { res.status(500).json({ error: "Error rating user" }); }
});

// 📱 1. SEND PHONE OTP (Simulated)
app.post('/api/user/phone/send-otp', async (req, res) => {
    try {
        const { username, phone } = req.body;
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Save OTP to DB
        await User.findOneAndUpdate({ username }, { phone, phoneOtp: otp });

        // 🚨 SIMULATION: Log to Console instead of paying for SMS
        console.log("========================================");
        console.log(`📱 SMS FOR ${phone}: ${otp}`);
        console.log("========================================");

        res.json({ message: "OTP sent to phone!" });
    } catch (err) { res.status(500).json({ error: "Error sending OTP" }); }
});

// 📱 2. VERIFY PHONE OTP
app.post('/api/user/phone/verify-otp', async (req, res) => {
    try {
        const { username, otp } = req.body;
        const user = await User.findOne({ username });

        if (user && user.phoneOtp === otp) {
            user.isPhoneVerified = true;
            user.phoneOtp = undefined; // Clear OTP
            await user.save();
            res.json({ message: "Phone Verified!", user });
        } else {
            res.status(400).json({ error: "Invalid OTP" });
        }
    } catch (err) { res.status(500).json({ error: "Verification failed" }); }
});

// 💰 PAY FOR RIDE
// 💰 PAY FOR RIDE & SEND RECEIPT
app.post('/api/rides/:id/pay', async (req, res) => {
    console.log("💰 Payment Request Received:", req.body);
    try {
        const { userEmail, amount } = req.body; // <--- Expect email from frontend

        // 1. Update DB
        const ride = await Ride.findByIdAndUpdate(req.params.id, { paymentStatus: 'paid' }, { new: true });

        // 2. Send Receipt Email
        const mailOptions = {
            from: 'SwiftWheels <csmailer11@gmail.com>', // ⚠️ Replace with your email
            to: userEmail,
            subject: '🚖 Payment Receipt - SwiftWheels',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #4f46e5;">Payment Successful!</h2>
                    <p>Hi there,</p>
                    <p>Thank you for riding with SwiftWheels. Here is your receipt.</p>
                    
                    <table style="width: 100%; margin-top: 20px;">
                        <tr><td><strong>Amount Paid:</strong></td><td>₹${amount}</td></tr>
                        <tr><td><strong>Driver:</strong></td><td>${ride.driver}</td></tr>
                        <tr><td><strong>Date:</strong></td><td>${new Date().toDateString()}</td></tr>
                        <tr><td><strong>Status:</strong></td><td style="color:green; font-weight:bold;">PAID via UPI</td></tr>
                    </table>
                    
                    <p style="margin-top: 30px; font-size: 12px; color: #888;">Safe Travels,<br>The SwiftWheels Team</p>
                </div>
            `
        };

        transporter.sendMail(mailOptions, (err, info) => {
            if (err) console.error("Email Error:", err);
            else console.log("Receipt sent:", info.response);
        });

        res.json({ message: "Payment Successful & Receipt Sent" });

    } catch (err) { res.status(500).json({ error: "Payment failed" }); }
});


// 📱 MOBILE CONFIRMATION PAGE (The link in the QR Code)
app.get('/pay-confirm/:id', async (req, res) => {
    try {
        await Ride.findByIdAndUpdate(req.params.id, { paymentStatus: 'paid' });
        
        // Return a simple HTML page to the phone
        res.send(`
            <div style="text-align:center; padding-top:50px; font-family:sans-serif;">
                <h1 style="color:green; font-size:50px;">✔</h1>
                <h2>Payment Successful!</h2>
                <p>You can verify this on your dashboard.</p>
            </div>
        `);
    } catch (err) { res.send("Error processing payment"); }
});

// 📩 CONTACT / FEEDBACK ROUTE
app.post('/api/contact', async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ error: "Please fill all fields" });
    }

    try {
        const mailOptions = {
            from: 'SwiftWheels <csmailer11@gmail.com>', // System Email
            to: 'vedantjadhav220106@gmail.com', // ⚠️ Send to YOURSELF (Admin)
            replyTo: email, // So you can click "Reply" to answer the user
            subject: `📢 New Feedback from ${name}`,
            html: `
                <div style="font-family: Arial; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h3 style="color: #10b981;">New Contact Request</h3>
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <hr>
                    <p><strong>Message:</strong></p>
                    <p style="background: #f9f9f9; padding: 15px; border-radius: 5px;">${message}</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ message: "Feedback sent successfully!" });

    } catch (error) {
        console.error("Contact Email Error:", error);
        res.status(500).json({ error: "Failed to send message" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));