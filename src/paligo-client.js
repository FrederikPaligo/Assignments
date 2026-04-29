const axios = require("axios");

class PaligoClient {
  constructor({ instance, email, apiKey }) {
    this.baseUrl = `https://${instance}.paligoapp.com/api/v2`;
    this.auth = { username: email, password: apiKey };
  }

  async createReviewAssignment({ documentId, groupId, label, deadline, message, lang = "en" }) {
    const now = Math.floor(Date.now() / 1000);
    const endDate = deadline ? now + deadline * 24 * 60 * 60 : now + 7 * 24 * 60 * 60;

    const payload = {
      assignees: { users: [], groups: [groupId] },
      document: documentId,
      type: "review",
      lang,
      start_date: now,
      end_date: endDate,
      ...(message && { message }),
    };

    console.log(`[paligo] Creating assignment: "${label}" for document ${documentId}, group ${groupId}`);

    const response = await axios.post(`${this.baseUrl}/assignments/`, payload, { auth: this.auth });
    console.log(`[paligo] ${response.data?.message || "Assignment created"}`);
    return response.data;
  }
}

module.exports = PaligoClient;
