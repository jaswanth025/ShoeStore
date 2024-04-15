const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log("Database connected successfully.");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
};

const usersSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  }
});

const ShoesSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  size: String,
  price: Number,
  buyingDate: Date,
  description: String,
  category: {
    type: String,
    enum: ['Sports', 'Sneakers', 'Loafers'] // Define allowed categories
  },
  materialUsed: String,
  ownerName: String, // Add owner's name
  ownerEmail: String, // Add owner's email
  ownerPhoneNo: String, // Add owner's phone number
  Pic: {
    filename: String,
    contentType: String,
    data: Buffer
  }
});

const SoldShoeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  size: String,
  price: Number,
  buyingDate: Date,
  description: String,
  category: String,
  materialUsed: String,
  ownerName: String, // Owner's name
  ownerEmail: String, // Owner's email
  ownerPhoneNo: String, // Owner's phone number
  customerName: String, // Customer's name
  customerEmail: String, // Customer's email
  customerAddress: String, // Customer's address
  customerCity: String, // Customer's city
  customerState: String, // Customer's state
  customerPostalCode: String, // Customer's postal code
  customerCountry: String // Customer's country
});

// Create models based on the schemas
const LogInCollection = mongoose.model("LogInCollection", usersSchema);
const Shoe = mongoose.model('ShoeData', ShoesSchema);
const SoldShoe = mongoose.model('SoldShoe', SoldShoeSchema);

module.exports = { connectDB, LogInCollection, Shoe, SoldShoe };
