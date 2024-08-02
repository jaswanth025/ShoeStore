const express = require("express");
const path = require("path");
const multer = require("multer");
const {
  connectDB,
  LogInCollection,
  Shoe,
  SoldShoe,
  bidsShoe,
} = require("./db");
const session = require("express-session");
const cors = require("cors");
const axios = require("axios");
const uniqid = require("uniqid");
const sha256 = require("sha256");

const PORT = process.env.PORT || 7000;

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: false,
  })
);

app.set("view engine", "ejs");

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.get("/pay", async function (req, res, next) {
  // Redirect to the home page
  res.redirect("/home");
});

app.post("/delivery/submit", async (req, res) => {
  try {
    const { name, email, address, phone, shoeId } = req.body;
    const selectedShoe = await Shoe.findById(shoeId);

    if (!selectedShoe) {
      return res.status(404).send("Shoe not found");
    }

    // Populate customer details
    const customerDetails = {
      customerName: name,
      customerEmail: email,
      customerAddress: address,
    };

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
      Pic: selectedShoe.Pic,
    });

    await newSoldShoe.save();
    await Shoe.findOneAndDelete({ _id: shoeId });

    // Redirect to the home page
    res.redirect("/home");
  } catch (error) {
    console.error("Error while submitting delivery details:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/sold", async (req, res) => {
  try {
    const soldShoes = await SoldShoe.find();

    if (!soldShoes || soldShoes.length === 0) {
      return res.status(404).send("No shoes found");
    }

    // Render the sold shoe details template and pass the shoes array
    res.render("sold", { soldShoes: soldShoes });
  } catch (error) {
    console.error("Error while fetching shoe details:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/sell", (req, res) => {
  const naming = req.session.username;
  res.render("sell", { naming: naming });
});

app.post("/bids/:shoeId", async (req, res) => {
  try {
    const shoeId = req.params.shoeId;
    const shoe = await Shoe.findById(shoeId);

    if (!shoe) {
      return res.status(404).send("Shoe not found");
    }

    // Add the shoe to the bidsShoe collection
    const newBidShoe = new bidsShoe(shoe);
    await newBidShoe.save();

    // Remove the shoe from the Shoe collection
    await Shoe.findOneAndDelete({ _id: shoeId });

    res.render("home");
  } catch (error) {
    console.error("Error while fetching shoe details:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/submit", upload.single("Pic"), async (req, res) => {
  try {
    const {
      name,
      size,
      price,
      buyingDate,
      description,
      category,
      materialUsed,
      ownerPhone,
      ownerEmail,
    } = req.body;
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
        data: buffer,
      },
    });

    await newShoe.save();

    // Redirect to the home page after successful form submission
    res.redirect("/home");
  } catch (error) {
    console.error("Error while submitting form:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/view/:shoeId", async (req, res) => {
  try {
    const shoeId = req.params.shoeId;
    const shoe = await Shoe.findById(shoeId);
    res.render("view", { shoe: shoe });
  } catch (error) {
    console.error("Error while fetching shoe details:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Assuming you have a route for displaying the delivery form
app.get("/delivery/:shoeId", async (req, res) => {
  try {
    const shoeId = req.params.shoeId;
    console.log(shoeId);
    const shoe = await Shoe.findById(shoeId);

    if (!shoe) {
      return res.status(404).send("Shoe not found");
    }

    // Render the delivery form template and pass the shoe details as an object
    res.render("delivery", { shoe: shoe });
  } catch (error) {
    console.error("Error while fetching shoe details:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/signup", (req, res) => {
  res.render("signup");
});

app.get("/", (req, res) => {
  res.render("login");
});

app.get("/home", async (req, res) => {
  try {
    const username = req.session.username;
    let shoes;

    // Extract the search query from the request parameters
    const searchQuery = req.query.search;
    console.log(searchQuery);

    if (searchQuery) {
      // Perform a case-insensitive search query in the database based on the shoe name
      shoes = await Shoe.find({ name: { $regex: searchQuery, $options: "i" } });
      console.log(shoes);
    } else {
      // If no search query is provided, fetch all shoes
      shoes = await Shoe.find();
    }

    res.render("home", { naming: username, shoes: shoes });
  } catch (error) {
    console.error("Error while fetching shoe data:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/signupcheck", async (req, res) => {
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
    res.redirect("/home");
  } catch (error) {
    console.error("Error while signing up:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/logincheck", async (req, res) => {
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
      res.redirect("/home");
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
