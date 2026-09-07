const mongoose = require("mongoose");

// Try with tls options
mongoose.connect("mongodb+srv://pandeysahil356_db_user:pandeysahil356_db_user@chatbotdb.qiipwkj.mongodb.net/?appName=ChatbotDB", {
  tlsAllowInvalidCertificates: true,
  tlsAllowInvalidHostnames: true
})
  .then(() => {
    console.log("MongoDB connected successfully ✅");
    process.exit(0);
  })
  .catch((error) => {
    console.error("MongoDB connection failed ❌", error.message);
    process.exit(1);
  });