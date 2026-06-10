/**
 * Paligo REST API Client
 *
 * Handles authentication, assignment creation, and taxonomy tagging.
 * Auth: Basic auth with email:apikey (base64 encoded)
 * Base URL: https://{instance}.paligoapp.com/api/v2
 */

const axios = require("axios");

class PaligoClient {
  constructor({ instance, email, apiKey }) {
    this.baseUrl = `https://${instance}.paligoapp.com/api/v2`;
    this.auth = {
      username: email,
      password: apiKey,
    };
  }

  /**
   * Create an assignment for a document, assigned to a usergroup.
   *
   * @param {Object} opts
   * @param {number} opts.documentId  - Paligo document ID
   * @param {number} opts.groupId     - Usergroup ID to assign to
   * @param {string} opts.label       - Human-readable name (for logging)
   * @param {number} opts.deadline    - Days from now for the deadline
   * @param {string} opts.type        - "review" or "contribution" (default: "review")
   * @param {string} opts.lang        - Language code (default: "en")
   * @param {string} opts.message     - Assignment comment/message
   */
  async createAssignment({ documentId, groupId, label, deadline, type = "review", message, lang = "en" }) {
    const now = Math.floor(Date.now() / 1000);
    const endDate = deadline
      ? now + deadline * 24 * 60 * 60
      : now + 7 * 24 * 60 * 60; // default 7 days

    const payload = {
      assignees: {
        users: [],
        groups: [groupId],
      },
      document: documentId,
      type,
      lang,
      start_date: now,
      end_date: endDate,
      ...(message && { message }),
    };

    console.log(`[paligo] Creating ${type} assignment: "${label}" for document ${documentId}`);
    console.log(`[paligo]   Group ID: ${groupId}, Deadline: ${new Date(endDate * 1000).toISOString().split("T")[0]}`);

    try {
      const response = await axios.post(
        `${this.baseUrl}/assignments/`,
        payload,
        { auth: this.auth }
      );

      console.log(`[paligo] Assignment created successfully`);
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const detail = error.response?.data || error.message;
      console.error(`[paligo] Failed to create assignment (HTTP ${status}):`, detail);
      throw new Error(`Paligo API error (${status}): ${JSON.stringify(detail)}`);
    }
  }

  /**
   * Add a taxonomy to a document.
   *
   * Note: Documents in "Released" or "In Review" status cannot be edited.
   * We first set release_status to STATUS_NOT_RELEASED, then update taxonomies.
   */
  async addTaxonomyToDocument(documentId, taxonomyId) {
    console.log(`[paligo] Adding taxonomy ${taxonomyId} to document ${documentId}`);

    // Get current document data
    const doc = await axios.get(
      `${this.baseUrl}/documents/${documentId}/`,
      { auth: this.auth }
    );

    const currentTaxonomies = (doc.data.taxonomies || []).map(t => t.id);
    if (currentTaxonomies.includes(taxonomyId)) {
      console.log(`[paligo] Taxonomy ${taxonomyId} already present — skipping`);
      return doc.data;
    }

    const newTaxonomies = [...currentTaxonomies, taxonomyId];

    // First: unlock document by setting release status
    await axios.put(
      `${this.baseUrl}/documents/${documentId}/`,
      { release_status: "STATUS_NOT_RELEASED" },
      { auth: this.auth }
    );

    // Then: update taxonomies
    const updated = await axios.put(
      `${this.baseUrl}/documents/${documentId}/`,
      { taxonomies: newTaxonomies },
      { auth: this.auth }
    );

    console.log(`[paligo] Taxonomy ${taxonomyId} added successfully`);
    return updated.data;
  }

  /**
   * List groups (usergroups) in the instance.
   */
  async listGroups() {
    const response = await axios.get(
      `${this.baseUrl}/groups`,
      { auth: this.auth }
    );
    return response.data;
  }
}

module.exports = PaligoClient;
