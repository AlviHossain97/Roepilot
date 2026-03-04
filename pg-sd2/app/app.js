const express = require("express");
const db = require("./services/db");
const app = express();
const { User } = require("./models/user");
const session = require("express-session");
const answerModel = require('./models/answerModel');
const multer = require("multer");
// const SQLiteStore = require("connect-sqlite3")(session); // Uncomment to use persistent session store

// Middleware: form parser & sessions
app.use(express.urlencoded({ extended: true }));
app.use(session({
  // store: new SQLiteStore({ db: 'sessions.sqlite' }), // Uncomment this for persistent sessions
  secret: 'secretkeysdfjsflyoifasd',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

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
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage: storage });

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
  const { identifier, password } = req.body;
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
  const { username, email, password, universityId } = req.body;
  const user = new User({ email, username });

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
  const { title, description, categoryId, bountyValue, tags } = req.body;
  const userId = req.session.user.id;
  const bounty = bountyValue ? parseInt(bountyValue) : 0;

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
        let tagRes = await db.query("SELECT TagID FROM Tags WHERE TagName = ?", [t]);
        let tagId;
        if (tagRes.length > 0) {
          tagId = tagRes[0].TagID;
        } else {
          const insertTag = await db.query("INSERT INTO Tags (TagName) VALUES (?)", [t]);
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
  const answerText = req.body.answerText;
  const redirectTo = req.get("referer") || "/supportrequests";

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
  const redirectTo = req.get("referer") || "/supportrequests";
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
  const redirectTo = req.get("referer") || "/supportrequests";
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
  const redirectTo = req.get("referer") || "/supportrequests";
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
  const { email, universityId } = req.body;
  const userId = req.session.user.id;
  const profilePic = req.file?.filename;

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
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).send("Page not found");
});

// Start server
app.listen(3000, () => {
  console.log("Server running at http://127.0.0.1:3000/");
});
