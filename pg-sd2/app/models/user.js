const db = require('../services/db');
const bcrypt = require("bcryptjs");

class User {
  constructor({ email, username }) {
    this.email = email;
    this.username = username;
  }

  async getByUsernameOrEmail(identifier) {
    const sql = "SELECT * FROM Users WHERE Email = ? OR Username = ?";
    const result = await db.query(sql, [identifier, identifier]);
    return result.length ? result[0] : null;
  }

  async addUser({ username, email, password, universityId }) {
    // Always hash the password for new registrations
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = `
      INSERT INTO Users (Username, Email, PasswordHash, UniversityID)
      VALUES (?, ?, ?, ?)
    `;
    await db.query(sql, [username, email, hashedPassword, universityId]);
    return true;
  }

  async authenticate(identifier, submittedPassword) {
    const user = await this.getByUsernameOrEmail(identifier);
    if (!user || !user.PasswordHash) return false;

    // If the stored value is not a bcrypt hash (placeholder), do a plain text comparison
    if (!user.PasswordHash.startsWith("$2a$") && !user.PasswordHash.startsWith("$2b$") && !user.PasswordHash.startsWith("$2y$")) {
      return submittedPassword === user.PasswordHash ? user : false;
    }

    // Otherwise, use bcrypt to compare the submitted password with the stored bcrypt hash
    const match = await bcrypt.compare(submittedPassword, user.PasswordHash);
    return match ? user : false;
  }
}

module.exports = {
  User
};