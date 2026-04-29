const { getChainForPublication } = require("./config/chains");

class ChainHandler {
  constructor(paligoClient) {
    this.paligo = paligoClient;
    this._stageTracker = {};
  }

  async handleApproval(webhookPayload) {
    const { data } = webhookPayload;
    const documentId = data.resource_id;
    const lang = data.language || "en";

    console.log(`[chain] Approval received for document ${documentId} ("${data.resource_title}")`);

    if (data.assignment_type && data.assignment_type !== "review") {
      console.log(`[chain] Skipping non-review assignment (type: ${data.assignment_type})`);
      return null;
    }

    const chain = getChainForPublication(String(documentId));
    const key = String(documentId);

    if (!(key in this._stageTracker)) {
      this._stageTracker[key] = 0;
    } else {
      this._stageTracker[key]++;
    }

    const nextIndex = this._stageTracker[key];

    if (nextIndex >= chain.length) {
      console.log(`[chain] Review chain complete — no more stages.`);
      delete this._stageTracker[key];
      return null;
    }

    const stage = chain[nextIndex];
    console.log(`[chain] Triggering stage ${nextIndex + 1}/${chain.length}: "${stage.label}"`);

    return await this.paligo.createReviewAssignment({
      documentId,
      groupId: stage.groupId,
      label: stage.label,
      deadline: stage.deadline,
      lang,
      message: `Auto-assigned: ${stage.label} (Stage ${nextIndex + 1} of ${chain.length})`,
    });
  }
}

module.exports = ChainHandler;
