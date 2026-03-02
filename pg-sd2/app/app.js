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
      user: req.session.user,
      stats: {
        totalRequests: totalRequestsRes[0].count,
        resolved: resolvedRes[0].count
      },
      recentActivity,
      topContributors
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
  res.render("login");
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
    res.render("login", { error: "Invalid credentials." });
  }
});

// Register
app.get('/register', (req, res) => {
  res.render('register');
});

app.post("/register", async (req, res) => {
  const { username, email, password, universityId } = req.body;
  const user = new User({ email, username });

  try {
    await user.addUser({ username, email, password, universityId });
    res.render("register", { success: "Account created! You can now log in." });
  } catch (err) {
    console.error(err);
    res.render("register", { error: "Error creating user: " + err });
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
      sessionUser: req.session.user
    });
  } catch (error) {
    res.render("users", {
      error: "Database error: " + error,
      sessionUser: req.session.user
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
      user: req.session.user
    });
  } catch (error) {
    res.status(500).send("Error loading profile: " + error);
  }
});

// Support Requests View
app.get("/supportrequests", async (req, res) => {
  const userId = req.query.user;
  const categoryId = req.query.category;

  try {
    let userName = null;
    let userPic = null;
    let pageTitle = "Support Requests";

    let requestsSql = `
      SELECT s.*, u.Username
      FROM SupportRequests s
      JOIN Users u ON s.UserID = u.UserID
    `;
    const sqlParams = [];

    if (userId) {
      requestsSql += " WHERE s.UserID = ?";
      sqlParams.push(userId);
    } else if (categoryId) {
      requestsSql += " WHERE s.CategoryID = ?";
      sqlParams.push(categoryId);
    }

    requestsSql += " ORDER BY s.PostDate DESC";

    const requests = await db.query(requestsSql, sqlParams);

    if (userId && requests.length > 0) {
      const userResult = await db.query("SELECT Username, ProfilePic FROM Users WHERE UserID = ?", [userId]);
      if (userResult.length > 0) {
        userName = userResult[0].Username;
        userPic = userResult[0].ProfilePic || "default-avatar.png";
        pageTitle = `Support Requests by ${userName}`;
      }
    }

    if (categoryId && requests.length > 0) {
      const catResult = await db.query("SELECT CategoryName FROM Categories WHERE CategoryID = ?", [categoryId]);
      if (catResult.length > 0) {
        pageTitle = `Support Requests in \"${catResult[0].CategoryName}\"`;
      }
    }

    const answers = await db.query("SELECT * FROM Answers");
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
      user: req.session.user
    });
  } catch (error) {
    res.render("supportrequests_combined", { error: "Database error: " + error });
  }
});

// New Support Request
app.get("/supportrequests/new", requireLogin, async (req, res) => {
  try {
    const categories = await db.query("SELECT * FROM Categories");
    res.render("new_supportrequest", {
      user: req.session.user,
      categories
    });
  } catch (error) {
    res.render("new_supportrequest", {
      error: "Error loading form: " + error
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
    res.render("new_supportrequest", { error: "Error submitting request: " + error });
  }
});

// Post an Answer
app.post("/answers/:requestId", requireLogin, async (req, res) => {
  const requestId = req.params.requestId;
  const userId = req.session.user.id;
  const answerText = req.body.answerText;

  try {
    await db.query(
      "INSERT INTO Answers (RequestID, UserID, AnswerText, PostDate, NumOfUpvote) VALUES (?, ?, ?, NOW(), 0)",
      [requestId, userId, answerText]
    );
    res.redirect("/supportrequests");
  } catch (error) {
    res.status(500).send("Error submitting answer: " + error);
  }
});

// Upvote Answer
app.post("/answers/upvote/:id", requireLogin, (req, res) => {
  const answerId = req.params.id;
  answerModel.upvoteAnswer(answerId)
    .then(() => {
      res.redirect("/supportrequests");
    })
    .catch(error => {
      res.status(500).send("Error upvoting answer: " + error);
    });
});

// Downvote Answer
app.post("/answers/downvote/:id", requireLogin, (req, res) => {
  answerModel.downvoteAnswer(req.params.id)
    .then(() => {
      res.redirect("/supportrequests");
    })
    .catch(error => {
      res.status(500).send("Error downvoting answer: " + error);
    });
});

// Accept Answer
app.post("/answers/accept/:id", requireLogin, async (req, res) => {
  const answerId = req.params.id;
  try {
    // We should ideally check if the current user is the author of the request
    await db.query("UPDATE Answers SET IsAccepted = 1 WHERE AnswerID = ?", [answerId]);

    // Reward credibility score to the answer author
    const ansData = await db.query("SELECT UserID FROM Answers WHERE AnswerID = ?", [answerId]);
    if (ansData.length > 0) {
      await db.query("UPDATE Users SET CredibilityScore = CredibilityScore + 15 WHERE UserID = ?", [ansData[0].UserID]);
    }

    res.redirect("/supportrequests");
  } catch (error) {
    res.status(500).send("Error accepting answer: " + error);
  }
});

// Categories
app.get("/categories", (req, res) => {
  db.query("SELECT * FROM Categories")
    .then(results => {
      res.render("categories", { categories: results });
    })
    .catch(error => {
      res.render("categories", { error: "Database error: " + error });
    });
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
      user: req.session.user
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
      user: req.session.user
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
