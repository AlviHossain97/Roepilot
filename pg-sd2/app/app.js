const express = require("express");
const db = require("./services/db");
const app = express();
const { User } = require("./models/user");
const session = require("express-session");
const answerModel = require('./models/answerModel');
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
// const SQLiteStore = require("connect-sqlite3")(session); // Uncomment to use persistent session store

// Middleware: form parser & sessions
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(session({
  // store: new SQLiteStore({ db: 'sessions.sqlite' }), // Uncomment this for persistent sessions
  name: "roepilot.sid",
  secret: process.env.SESSION_SECRET || crypto.randomBytes(48).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: https://ui-avatars.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' https://unpkg.com; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
  next();
});

function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  return req.session.csrfToken;
}

function getSafeRedirect(req, fallback = "/supportrequests") {
  const referer = req.get("referer");
  if (!referer) return fallback;
  try {
    const refererUrl = new URL(referer);
    return `${refererUrl.pathname}${refererUrl.search || ""}`;
  } catch {
    if (referer.startsWith("/") && !referer.startsWith("//")) return referer;
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || "").trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

app.use((req, res, next) => {
  res.locals.csrfToken = ensureCsrfToken(req);
  next();
});

function hasValidCsrfToken(req) {
  const submittedToken = req.body?._csrf || req.get("x-csrf-token");
  return Boolean(submittedToken && submittedToken === req.session.csrfToken);
}

app.use((req, res, next) => {
  const protectedMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  if (!protectedMethods.has(req.method)) return next();
  if (req.is("multipart/form-data")) return next();
  if (!hasValidCsrfToken(req)) {
    return res.status(403).send("Security token validation failed. Please refresh and try again.");
  }
  next();
});

function resolveActivePage(pathname = "") {
  if (pathname === "/home") return "home";
  if (pathname.startsWith("/supportrequests")) return "requests";
  if (pathname.startsWith("/categories")) return "categories";
  if (pathname.startsWith("/users")) return "users";
  if (pathname.startsWith("/profile")) return "profile";
  return "";
}

app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  res.locals.activePage = resolveActivePage(req.path);
  next();
});

// Configure file uploads for profile pictures
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./static/images");
  },
  filename: function (req, file, cb) {
    const cleanName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueName = Date.now() + "-" + cleanName;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, WEBP, and GIF images are allowed."));
    }
    cb(null, true);
  }
});

// Serve static files
app.use(express.static("static"));

// Set Pug as the view engine
app.set("view engine", "pug");
app.set("views", "./app/views");

// Middleware: protect routes
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

// Home / Dashboard
app.get("/home", requireLogin, async (req, res) => {
  try {
    const totalRequestsRes = await db.query("SELECT COUNT(*) AS count FROM SupportRequests");
    const resolvedRes = await db.query("SELECT COUNT(*) AS count FROM SupportRequests WHERE IsResolved = 1");

    // Recent activity (latest 5 requests)
    const recentActivity = await db.query(`
      SELECT s.Title, s.PostDate, u.Username, s.IsResolved
      FROM SupportRequests s
      JOIN Users u ON s.UserID = u.UserID
      ORDER BY s.PostDate DESC LIMIT 5
    `);

    // Top contributors (based on CredibilityScore)
    const topContributors = await db.query(`
      SELECT Username, CredibilityScore FROM Users
      ORDER BY CredibilityScore DESC LIMIT 5
    `);

    res.render("index", {
      stats: {
        totalRequests: totalRequestsRes[0].count,
        resolved: resolvedRes[0].count
      },
      recentActivity,
      topContributors,
      pageTitle: "Dashboard"
    });
  } catch (e) {
    res.status(500).send("Error loading dashboard");
  }
});

// Redirect root to login
app.get("/", (req, res) => {
  res.redirect("/login");
});

// Login
app.get("/login", (req, res) => {
  if (req.session.user) {
    return res.redirect("/home");
  }
  res.render("login", { pageTitle: "Login" });
});

app.post("/login", async (req, res) => {
  const identifier = normalizeText(req.body.identifier);
  const password = String(req.body.password || "");
  if (!identifier || !password) {
    return res.render("login", { error: "Username/email and password are required.", pageTitle: "Login" });
  }
  const user = new User({});
  const authUser = await user.authenticate(identifier, password);

  if (authUser) {
    req.session.user = {
      id: authUser.UserID,
      username: authUser.Username
    };
    return res.redirect("/home");
  } else {
    res.render("login", { error: "Invalid credentials.", pageTitle: "Login" });
  }
});

// Register
app.get('/register', (req, res) => {
  res.render('register', { pageTitle: "Register" });
});

app.post("/register", async (req, res) => {
  const username = normalizeText(req.body.username);
  const email = normalizeText(req.body.email).toLowerCase();
  const password = String(req.body.password || "");
  const universityId = normalizeText(req.body.universityId);
  const user = new User({ email, username });

  if (username.length < 3 || username.length > 40) {
    return res.render("register", { error: "Username must be between 3 and 40 characters.", pageTitle: "Register" });
  }
  if (!isValidEmail(email)) {
    return res.render("register", { error: "Enter a valid email address.", pageTitle: "Register" });
  }
  if (password.length < 8) {
    return res.render("register", { error: "Password must be at least 8 characters.", pageTitle: "Register" });
  }
  if (!universityId || universityId.length > 30) {
    return res.render("register", { error: "University ID is required and must be under 30 characters.", pageTitle: "Register" });
  }

  try {
    await user.addUser({ username, email, password, universityId });
    res.render("register", {
      success: "Account created! You can now log in.",
      pageTitle: "Register"
    });
  } catch (err) {
    console.error(err);
    res.render("register", {
      error: "Error creating user: " + err,
      pageTitle: "Register"
    });
  }
});

// Users
app.get("/users", async (req, res) => {
  const search = req.query.search;
  let sql = "SELECT * FROM Users";
  let params = [];

  if (search) {
    sql += " WHERE Username LIKE ? OR Email LIKE ? OR UniversityID LIKE ? OR CredibilityScore LIKE ?";
    const wildcard = `%${search}%`;
    params = [wildcard, wildcard, wildcard, wildcard];
  }

  try {
    const results = await db.query(sql, params);
    res.render("users", {
      users: results,
      search,
      pageTitle: "Users"
    });
  } catch (error) {
    res.render("users", {
      error: "Database error: " + error,
      search,
      pageTitle: "Users"
    });
  }
});

// View another user's profile
app.get("/users/:id", async (req, res) => {
  const userId = req.params.id;

  try {
    const userResult = await db.query("SELECT * FROM Users WHERE UserID = ?", [userId]);
    const requests = await db.query("SELECT * FROM SupportRequests WHERE UserID = ?", [userId]);
    const answers = await db.query(`
      SELECT a.*, s.Title AS RequestTitle
      FROM Answers a
      JOIN SupportRequests s ON a.RequestID = s.RequestID
      WHERE a.UserID = ?
    `, [userId]);

    if (userResult.length === 0) return res.status(404).send("User not found");

    res.render("profile", {
      profileUser: userResult[0],
      supportRequests: requests,
      userAnswers: answers,
      isSelf: req.session.user?.id == userId,
      pageTitle: `${userResult[0].Username} Profile`
    });
  } catch (error) {
    res.status(500).send("Error loading profile: " + error);
  }
});

// Support Requests View
app.get("/supportrequests", async (req, res) => {
  const userId = req.query.user;
  const categoryId = req.query.category;
  const search = (req.query.search || "").trim();
  const hasActiveFilter = Boolean(userId || categoryId || search);

  try {
    let userName = null;
    let userPic = null;
    let pageTitle = "Support Requests";

    let requestsSql = `
      SELECT s.*, u.Username
      FROM SupportRequests s
      JOIN Users u ON s.UserID = u.UserID
    `;
    const whereClauses = [];
    const sqlParams = [];

    if (userId) {
      whereClauses.push("s.UserID = ?");
      sqlParams.push(userId);
    }

    if (categoryId) {
      whereClauses.push("s.CategoryID = ?");
      sqlParams.push(categoryId);
    }

    if (search) {
      whereClauses.push("(s.Title LIKE ? OR s.Description LIKE ? OR u.Username LIKE ?)");
      const wildcard = `%${search}%`;
      sqlParams.push(wildcard, wildcard, wildcard);
    }

    if (whereClauses.length > 0) {
      requestsSql += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    requestsSql += " ORDER BY s.PostDate DESC";

    const requests = await db.query(requestsSql, sqlParams);

    if (userId) {
      const userResult = await db.query("SELECT Username, ProfilePic FROM Users WHERE UserID = ?", [userId]);
      if (userResult.length > 0) {
        userName = userResult[0].Username;
        userPic = userResult[0].ProfilePic || "default-avatar.png";
        pageTitle = `Support Requests by ${userName}`;
      }
    }

    if (categoryId) {
      const catResult = await db.query("SELECT CategoryName FROM Categories WHERE CategoryID = ?", [categoryId]);
      if (catResult.length > 0) {
        pageTitle = `Support Requests in \"${catResult[0].CategoryName}\"`;
      }
    }

    if (search) {
      pageTitle = `Search: "${search}"`;
    }

    const answers = await db.query(`
      SELECT a.*, u.Username AS AnswerAuthor, s.UserID AS RequestOwnerID
      FROM Answers a
      JOIN Users u ON a.UserID = u.UserID
      JOIN SupportRequests s ON a.RequestID = s.RequestID
      ORDER BY a.PostDate ASC
    `);
    const groupedAnswers = {};
    answers.forEach(answer => {
      if (!groupedAnswers[answer.RequestID]) {
        groupedAnswers[answer.RequestID] = [];
      }
      groupedAnswers[answer.RequestID].push(answer);
    });

    const categories = await db.query("SELECT * FROM Categories");
    const categoryMap = {};
    categories.forEach(cat => {
      categoryMap[cat.CategoryID] = cat.CategoryName;
    });

    // Fetch tags for each request
    const tags = await db.query(`
      SELECT rt.RequestID, t.TagName 
      FROM RequestTags rt 
      JOIN tags t ON rt.TagID = t.TagID
    `);
    const groupedTags = {};
    tags.forEach(tag => {
      if (!groupedTags[tag.RequestID]) groupedTags[tag.RequestID] = [];
      groupedTags[tag.RequestID].push(tag.TagName);
    });

    const combinedData = requests.map(req => ({
      ...req,
      answers: groupedAnswers[req.RequestID] || [],
      tags: groupedTags[req.RequestID] || [],
      CategoryName: categoryMap[req.CategoryID] || "Uncategorized"
    }));

    res.render("supportrequests_combined", {
      posts: combinedData,
      filterUserName: userName,
      filterUserPic: userPic,
      pageTitle,
      search,
      filterUserId: userId,
      filterCategoryId: categoryId,
      hasActiveFilter
    });
  } catch (error) {
    res.render("supportrequests_combined", {
      error: "Database error: " + error,
      search,
      pageTitle: "Support Requests",
      hasActiveFilter
    });
  }
});

// New Support Request
app.get("/supportrequests/new", requireLogin, async (req, res) => {
  try {
    const categories = await db.query("SELECT * FROM Categories");
    res.render("new_supportrequest", {
      categories,
      pageTitle: "New Support Request"
    });
  } catch (error) {
    res.render("new_supportrequest", {
      error: "Error loading form: " + error,
      categories: [],
      pageTitle: "New Support Request"
    });
  }
});

app.post("/supportrequests", requireLogin, async (req, res) => {
  const title = normalizeText(req.body.title);
  const description = normalizeText(req.body.description);
  const categoryId = Number.parseInt(req.body.categoryId, 10);
  const tags = normalizeText(req.body.tags);
  const bountyValue = req.body.bountyValue;
  const userId = req.session.user.id;
  const bounty = bountyValue ? Number.parseInt(bountyValue, 10) : 0;

  if (title.length < 5 || title.length > 150) {
    const categories = await db.query("SELECT * FROM Categories");
    return res.render("new_supportrequest", { error: "Title must be between 5 and 150 characters.", categories, pageTitle: "New Support Request" });
  }
  if (description.length < 15 || description.length > 4000) {
    const categories = await db.query("SELECT * FROM Categories");
    return res.render("new_supportrequest", { error: "Description must be between 15 and 4000 characters.", categories, pageTitle: "New Support Request" });
  }
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    const categories = await db.query("SELECT * FROM Categories");
    return res.render("new_supportrequest", { error: "Select a valid category.", categories, pageTitle: "New Support Request" });
  }
  if (!Number.isInteger(bounty) || bounty < 0 || bounty > 5000) {
    const categories = await db.query("SELECT * FROM Categories");
    return res.render("new_supportrequest", { error: "Bounty must be between 0 and 5000.", categories, pageTitle: "New Support Request" });
  }

  try {
    const result = await db.query(
      "INSERT INTO SupportRequests (UserID, Title, Description, CategoryID, BountyValue, PostDate) VALUES (?, ?, ?, ?, ?, NOW())",
      [userId, title, description, categoryId, bounty]
    );

    // Insert tags if provided (comma separated)
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim()).filter(t => t);
      for (const t of tagList) {
        // Find or create tag
        let tagRes = await db.query("SELECT TagID FROM Tags WHERE TagName = ?", [t.slice(0, 40)]);
        let tagId;
        if (tagRes.length > 0) {
          tagId = tagRes[0].TagID;
        } else {
          const insertTag = await db.query("INSERT INTO Tags (TagName) VALUES (?)", [t.slice(0, 40)]);
          tagId = insertTag.insertId;
        }
        await db.query("INSERT INTO RequestTags (RequestID, TagID) VALUES (?, ?)", [result.insertId, tagId]);
      }
    }

    res.redirect("/supportrequests");
  } catch (error) {
    let categories = [];
    try {
      categories = await db.query("SELECT * FROM Categories");
    } catch (catErr) {
      console.error("Error loading categories after submit failure:", catErr);
    }

    res.render("new_supportrequest", {
      error: "Error submitting request: " + error,
      categories,
      pageTitle: "New Support Request"
    });
  }
});

// Post an Answer
app.post("/answers/:requestId", requireLogin, async (req, res) => {
  const requestId = req.params.requestId;
  const userId = req.session.user.id;
  const answerText = normalizeText(req.body.answerText);
  const redirectTo = getSafeRedirect(req, "/supportrequests");

  if (answerText.length < 2 || answerText.length > 2500) {
    return res.status(400).send("Answer must be between 2 and 2500 characters.");
  }

  try {
    await db.query(
      "INSERT INTO Answers (RequestID, UserID, AnswerText, PostDate, NumOfUpvote) VALUES (?, ?, ?, NOW(), 0)",
      [requestId, userId, answerText]
    );
    res.redirect(redirectTo);
  } catch (error) {
    res.status(500).send("Error submitting answer: " + error);
  }
});

// Upvote Answer
app.post("/answers/upvote/:id", requireLogin, (req, res) => {
  const answerId = req.params.id;
  const redirectTo = getSafeRedirect(req, "/supportrequests");
  answerModel.upvoteAnswer(answerId)
    .then(() => {
      res.redirect(redirectTo);
    })
    .catch(error => {
      res.status(500).send("Error upvoting answer: " + error);
    });
});

// Downvote Answer
app.post("/answers/downvote/:id", requireLogin, (req, res) => {
  const redirectTo = getSafeRedirect(req, "/supportrequests");
  answerModel.downvoteAnswer(req.params.id)
    .then(() => {
      res.redirect(redirectTo);
    })
    .catch(error => {
      res.status(500).send("Error downvoting answer: " + error);
    });
});

// Accept Answer
app.post("/answers/accept/:id", requireLogin, async (req, res) => {
  const answerId = req.params.id;
  const redirectTo = getSafeRedirect(req, "/supportrequests");
  try {
    const ownership = await db.query(`
      SELECT s.UserID AS RequestOwnerID
      FROM Answers a
      JOIN SupportRequests s ON a.RequestID = s.RequestID
      WHERE a.AnswerID = ?
    `, [answerId]);

    if (ownership.length === 0) {
      return res.status(404).send("Answer not found.");
    }

    if (Number(ownership[0].RequestOwnerID) !== Number(req.session.user.id)) {
      return res.status(403).send("Only the support request owner can accept an answer.");
    }

    await db.query("UPDATE Answers SET IsAccepted = 1 WHERE AnswerID = ?", [answerId]);

    // Reward credibility score to the answer author
    const ansData = await db.query("SELECT UserID FROM Answers WHERE AnswerID = ?", [answerId]);
    if (ansData.length > 0) {
      await db.query("UPDATE Users SET CredibilityScore = CredibilityScore + 15 WHERE UserID = ?", [ansData[0].UserID]);
    }

    res.redirect(redirectTo);
  } catch (error) {
    res.status(500).send("Error accepting answer: " + error);
  }
});

// Categories
app.get("/categories", async (req, res) => {
  const search = (req.query.search || "").trim();
  let sql = "SELECT * FROM Categories";
  const params = [];

  if (search) {
    sql += " WHERE CategoryName LIKE ? OR Description LIKE ?";
    const wildcard = `%${search}%`;
    params.push(wildcard, wildcard);
  }

  try {
    const results = await db.query(sql, params);
    res.render("categories", { categories: results, search, pageTitle: "Categories" });
  } catch (error) {
    res.render("categories", {
      error: "Database error: " + error,
      search,
      pageTitle: "Categories"
    });
  }
});

// My Profile View
app.get("/profile", requireLogin, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const userResult = await db.query("SELECT * FROM Users WHERE UserID = ?", [userId]);
    const requests = await db.query("SELECT * FROM SupportRequests WHERE UserID = ?", [userId]);
    const answers = await db.query(`
      SELECT a.*, s.Title AS RequestTitle
      FROM Answers a
      JOIN SupportRequests s ON a.RequestID = s.RequestID
      WHERE a.UserID = ?
    `, [userId]);

    res.render("profile", {
      profileUser: userResult[0],
      supportRequests: requests,
      userAnswers: answers,
      isSelf: true,
      pageTitle: "My Profile"
    });
  } catch (error) {
    res.status(500).send("Error loading profile: " + error);
  }
});

// Edit Profile Form
app.get("/profile/edit", requireLogin, async (req, res) => {
  const userId = req.session.user.id;
  try {
    const userResult = await db.query("SELECT * FROM Users WHERE UserID = ?", [userId]);
    res.render("edit_profile", {
      profileUser: userResult[0],
      pageTitle: "Edit Profile"
    });
  } catch (err) {
    res.status(500).send("Error loading profile edit form: " + err);
  }
});

// Edit Profile Submit
app.post("/profile/edit", requireLogin, upload.single("profilePic"), async (req, res) => {
  if (!hasValidCsrfToken(req)) {
    return res.status(403).send("Security token validation failed. Please refresh and try again.");
  }
  const email = normalizeText(req.body.email).toLowerCase();
  const universityId = normalizeText(req.body.universityId);
  const userId = req.session.user.id;
  const profilePic = req.file?.filename;

  if (!isValidEmail(email)) {
    return res.status(400).send("Invalid email address.");
  }
  if (universityId.length > 30) {
    return res.status(400).send("University ID must be under 30 characters.");
  }

  try {
    const updateFields = ["Email = ?", "UniversityID = ?"];
    const values = [email, universityId];

    if (profilePic) {
      updateFields.push("ProfilePic = ?");
      values.push(profilePic);
    }

    values.push(userId);

    const sql = `UPDATE Users SET ${updateFields.join(", ")} WHERE UserID = ?`;
    await db.query(sql, values);

    res.redirect("/profile");
  } catch (err) {
    res.status(500).send("Error updating profile: " + err);
  }
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err?.message?.includes("images are allowed")) {
    return res.status(400).send(err.message);
  }
  next(err);
});

// 404 handler
app.use((req, res) => {
  res.status(404).send("Page not found");
});

// Start server
app.listen(3000, () => {
  console.log("Server running at http://127.0.0.1:3000/");
});
