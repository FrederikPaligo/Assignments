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

  async addTaxonomyToDocument(documentId, taxonomyId) {
    console.log(`[paligo] Adding taxonomy ${taxonomyId} to document ${documentId}`);

    // Get current document to preserve existing taxonomies
    const doc = await axios.get(`${this.baseUrl}/documents/${documentId}/`, { auth: this.auth });
    const currentTaxonomies = (doc.data.taxonomies || []).map(t => t.id);

    if (currentTaxonomies.includes(taxonomyId)) {
      console.log(`[paligo] Taxonomy already assigned, skipping`);
      return doc.data;
    }

    const newTaxonomies = [...currentTaxonomies, taxonomyId];

    // Need to clear release status to edit, then add taxonomy
    const currentStatus = doc.data.release_status;
    try {
      await axios.put(`${this.baseUrl}/documents/${documentId}/`,
        { release_status: "STATUS_NOT_RELEASED" },
        { auth: this.auth }
      );

      const updated = await axios.put(`${this.baseUrl}/documents/${documentId}/`,
        { taxonomies: newTaxonomies },
        { auth: this.auth }
      );

      console.log(`[paligo] Taxonomy "Staging for Release" added to document ${documentId}`);
      return updated.data;
    } catch (error) {
      console.error(`[paligo] Failed to add taxonomy:`, error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = PaligoClient;
