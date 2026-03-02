const db = require('../services/db');

// Define the upvote function
function upvoteAnswer(answerId) {
  const sql = "UPDATE answers SET NumOfUpvote = NumOfUpvote + 1 WHERE AnswerID = ?";
  return db.query(sql, [answerId]);
}

// Define the downvote function
function downvoteAnswer(answerId) {
  const sql = "UPDATE answers SET NumOfUpvote = CASE WHEN NumOfUpvote > 0 THEN NumOfUpvote - 1 ELSE 0 END WHERE AnswerID = ?";
  return db.query(sql, [answerId]);
}

// Export both
module.exports = {
  upvoteAnswer,
  downvoteAnswer
};