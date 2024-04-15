const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const multer = require('multer');
const { connectDB, LogInCollection, Shoe, SoldShoe } = require('./db');
const session = require('express-session');
const cors = require("cors");
const axios = require("axios");
const uniqid=require('uniqid');
const sha256=require("sha256");

const PORT = process.env.PORT || 7000;


const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false
}));

app.set('view engine', 'ejs');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.User,
        pass: process.env.APP_PASSWORD,
    },
});
const MERCHANT_ID = "PGTESTPAYUAT";
const PHONE_PE_HOST_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox";
const SALT_INDEX = 1;
const SALT_KEY = "099eb0cd-02cf-4e2a-8aca-3e6c6aff0399";
const APP_BE_URL = "http://localhost:8000"; // our application
app.get("/pay", async function (req, res, next) {
    // Initiate a payment
  
    // Transaction amount
    const amount = +req.query.amount;
  
    // User ID is the ID of the user present in our application DB
    let userId = "MUID123";
  
    // Generate a unique merchant transaction ID for each transaction
    let merchantTransactionId = uniqid();
  
    // redirect url => phonePe will redirect the user to this url once payment is completed. It will be a GET request, since redirectMode is "REDIRECT"
    let normalPayLoad = {
      merchantId: MERCHANT_ID, //* PHONEPE_MERCHANT_ID . Unique for each account (private)
      merchantTransactionId: merchantTransactionId,
      merchantUserId: userId,
      amount: req.session.price*100 , // converting to paise
      redirectUrl: `${APP_BE_URL}/payment/validate/${merchantTransactionId}`,
      redirectMode: "REDIRECT",
      mobileNumber: "9999999999",
      paymentInstrument: {
        type: "PAY_PAGE",
      },
    };
  
    // make base64 encoded payload
    let bufferObj = Buffer.from(JSON.stringify(normalPayLoad), "utf8");
    let base64EncodedPayload = bufferObj.toString("base64");
  
    // X-VERIFY => SHA256(base64EncodedPayload + "/pg/v1/pay" + SALT_KEY) + ### + SALT_INDEX
    let string = base64EncodedPayload + "/pg/v1/pay" + SALT_KEY;
    let sha256_val = sha256(string);
    let xVerifyChecksum = sha256_val + "###" + SALT_INDEX;
  
    try {
      const response = await axios.post(
        `${PHONE_PE_HOST_URL}/pg/v1/pay`,
        {
          request: base64EncodedPayload,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-VERIFY": xVerifyChecksum,
            accept: "application/json",
          },
        }
      );
  
      console.log("response->", JSON.stringify(response.data));
      res.redirect(response.data.data.instrumentResponse.redirectInfo.url);
    } catch (error) {
      console.error("Error initiating payment:", error);
      res.send(error);
    }
  });
  
  // endpoint to check the status of payment
  app.get("/payment/validate/:merchantTransactionId", async function (req, res) {
    const { merchantTransactionId } = req.params;
    // check the status of the payment using merchantTransactionId
    if (merchantTransactionId) {
      let statusUrl =
        `${PHONE_PE_HOST_URL}/pg/v1/status/${MERCHANT_ID}/` +
        merchantTransactionId;
  
      // generate X-VERIFY
      let string =
        `/pg/v1/status/${MERCHANT_ID}/` + merchantTransactionId + SALT_KEY;
      let sha256_val = sha256(string);
      let xVerifyChecksum = sha256_val + "###" + SALT_INDEX;
  
      try {
        const response = await axios.get(statusUrl, {
          headers: {
            "Content-Type": "application/json",
            "X-VERIFY": xVerifyChecksum,
            "X-MERCHANT-ID": merchantTransactionId,
            accept: "application/json",
          },
        });
  
        console.log("response->", response.data);
        if (response.data && response.data.code === "PAYMENT_SUCCESS") {
          // redirect to FE payment success status page
          res.redirect('/home');

        //   res.render('home')
        //   window.open('http://localhost:8000/home', '_blank');
        } else {
          // redirect to FE payment failure / pending status page
        }
      } catch (error) {
        console.error("Error validating payment:", error);
        // redirect to FE payment failure / pending status page
        res.send(error);
      }
    } else {
      res.send("Sorry!! Error");
    }
  });
  
app.post('/delivery/submit', async (req, res) => {
    try {
        const { name, email, address, phone, price, shoeId } = req.body;
        const selectedShoe = await Shoe.findById(shoeId);

        console.log("Submitted Shoe Name:", shoeId);

        if (!selectedShoe) {
            return res.status(404).send('Shoe not found');
        }
        req.session.price = selectedShoe.price;
 
        // Populate customer details
        const customerDetails = {
            customerName: name,
            customerEmail: email,
            customerAddress: address,
        };

        const customerMailOptions = {
            from: {
                name: "Shoe Store",
                address: process.env.User
            },
            to: email,
            subject: "Delivery Confirmation",
            // Include only specific shoe details
            text: `Dear ${name},\n\nThank you for your order. Your delivery details:\nName: ${name}\nSize: ${selectedShoe.size}\nCategory: ${selectedShoe.category}\nPrice: $${selectedShoe.price}\nMaterial: ${selectedShoe.materialUsed}\nBuying Date: ${selectedShoe.buyingDate}`,
        };

        await transporter.sendMail(customerMailOptions);

        const ownerMailOptions = {
            from: {
                name: "Shoe Store",
                address: process.env.User
            },
            to: selectedShoe.ownerEmail,
            subject: "New Delivery Details Submitted",
            // Include only specific shoe details
            text: `Delivery details submitted:\nName: ${name}\nEmail: ${email}\nAddress: ${address}\nSize: ${selectedShoe.size}\nCategory: ${selectedShoe.category}\nPrice: $${selectedShoe.price}\nMaterial: ${selectedShoe.materialUsed}\nBuying Date: ${selectedShoe.buyingDate}`,
        };

        await transporter.sendMail(ownerMailOptions);

        // Populate sold shoe with customer and owner details
        const newSoldShoe = new SoldShoe({
            ...customerDetails,
            ownerName: selectedShoe.ownerName,
            ownerEmail: selectedShoe.ownerEmail,
            ownerPhoneNo: selectedShoe.ownerPhoneNo,
            name: selectedShoe.name,
            size: selectedShoe.size,
            price: selectedShoe.price,
            buyingDate: selectedShoe.buyingDate,
            category: selectedShoe.category,
            materialUsed: selectedShoe.materialUsed,
            Pic: selectedShoe.Pic
        });

        await newSoldShoe.save();

        // Remove the shoe from the database after selling
        await Shoe.findOneAndDelete({ _id: shoeId });

        // Redirect to the home page
        res.redirect('/pay');

    } catch (error) {
        console.error("Error while submitting delivery details:", error);
        res.status(500).send("Internal Server Error");
    }
});
// Define a route to handle the /sold endpoint
// Define a route to handle the /sold endpoint
app.get('/sold', async (req, res) => {
    try {
        const soldShoes = await SoldShoe.find();
        
        if (!soldShoes || soldShoes.length === 0) {
            return res.status(404).send('No shoes found');
        }

        // Render the sold shoe details template and pass the shoes array
        res.render('sold', { soldShoes: soldShoes });
    } catch (error) {
        console.error("Error while fetching shoe details:", error);
        res.status(500).send("Internal Server Error");
    }
});



// Existing code...


app.get('/sell', (req, res) => {
    const naming = req.session.username;
    res.render('sell', { naming: naming });
});



app.post('/submit', upload.single('Pic'), async (req, res) => {
    try {
        const { name, size, price, buyingDate, description, category, materialUsed, ownerPhone, ownerEmail } = req.body;
        const ownerName = req.session.username;

        const { originalname, mimetype, buffer } = req.file;

        const newShoe = new Shoe({
            ownerName,
            ownerPhone,
            ownerEmail,
            name,
            size,
            price,
            buyingDate,
            description,
            category,
            materialUsed,
            Pic: {
                filename: originalname,
                contentType: mimetype,
                data: buffer
            }
        });

        await newShoe.save();

        // Redirect to the home page after successful form submission
        res.redirect('/home');
    } catch (error) {
        console.error("Error while submitting form:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/view/:shoeId', async (req, res) => {
    try {
        const shoeId = req.params.shoeId;
        const shoe = await Shoe.findById(shoeId);
        res.render('view', { shoe: shoe });
    } catch (error) {
        console.error("Error while fetching shoe details:", error);
        res.status(500).send("Internal Server Error");
    }
});

// Assuming you have a route for displaying the delivery form
app.get('/delivery/:shoeId', async (req, res) => {
    try {
        const shoeId = req.params.shoeId;
        console.log(shoeId);
        const shoe = await Shoe.findById(shoeId);
        
        if (!shoe) {
            return res.status(404).send('Shoe not found');
        }

        // Render the delivery form template and pass the shoe details as an object
        res.render('delivery', { shoe: shoe });
    } catch (error) {
        console.error("Error while fetching shoe details:", error);
        res.status(500).send("Internal Server Error");
    }
});


app.get('/signup', (req, res) => {
    res.render('signup');
});

app.get('/', (req, res) => {
    res.render('login');
});

app.get('/home', async (req, res) => {
    try {
        const username = req.session.username;
        let shoes;

        // Extract the search query from the request parameters
        const searchQuery = req.query.search;
        console.log(searchQuery);

        if (searchQuery) {
            // Perform a case-insensitive search query in the database based on the shoe name
            shoes = await Shoe.find({ name: { $regex: searchQuery, $options: 'i' } });
            console.log(shoes)
        } else {
            // If no search query is provided, fetch all shoes
            shoes = await Shoe.find();
        }

        res.render('home', { naming: username, shoes: shoes });
    } catch (error) {
        console.error("Error while fetching shoe data:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.post('/signupcheck', async (req, res) => { 
    try {
        const { name, password } = req.body;
        
        const existingUser = await LogInCollection.findOne({ name });

        if (existingUser) {
            return res.send("User details already exist");
        }

        await LogInCollection.create({ name, password });

        // Set the username in the session
        req.session.username = name;
        console.log("Username stored in session:", req.session.username);

        // Redirect to the home page
        res.redirect('/home');
    } catch (error) {
        console.error("Error while signing up:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.post('/logincheck', async (req, res) => {
    try {
        const { name, password } = req.body;
        const user = await LogInCollection.findOne({ name });

        if (!user || user.password !== password) {
            res.send("Incorrect username or password");
        } else {
            // Set the username in the session
            req.session.username = name;
            console.log("Username stored in session:", req.session.username);

            // Redirect to the home page
            res.redirect('/home');
        }
    } catch (error) {
        console.error("Error while logging in:", error);
        res.status(500).send("Internal Server Error");
    }
});

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
});
