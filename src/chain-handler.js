const { getChainForPublication } = require("./config/chains");

class ChainHandler {
  constructor(paligoClient) {
    this.paligo = paligoClient;
    this._stageTracker = {};
  }

  async handleWebhook(webhookPayload) {
    const { data } = webhookPayload;
    const documentId = data.resource_id;
    const lang = data.language || "en";
    const status = data.status;

    console.log(`[chain] Webhook for document ${documentId} ("${data.resource_title}") — status: ${status}`);

    if (data.assignment_type && data.assignment_type !== "review") {
      console.log(`[chain] Skipping non-review assignment`);
      return null;
    }

    const chain = getChainForPublication(String(documentId));
    const key = String(documentId);

    if (status === "approved") {
      return await this._handleApproval(key, chain, documentId, lang);
    } else if (status === "rejected") {
      return await this._handleRejection(key, chain, documentId, lang);
    } else {
      console.log(`[chain] Unknown status: ${status}, ignoring`);
      return null;
    }
  }

  async _handleApproval(key, chain, documentId, lang) {
    if (!(key in this._stageTracker)) {
      this._stageTracker[key] = 0;
    } else {
      this._stageTracker[key]++;
    }

    const nextIndex = this._stageTracker[key];

    if (nextIndex >= chain.length) {
      console.log(`[chain] Review chain complete — all stages done.`);
      delete this._stageTracker[key];
      return null;
    }

    const stage = chain[nextIndex];
    console.log(`[chain] Approved → triggering stage ${nextIndex + 1}/${chain.length}: "${stage.label}"`);

    return await this.paligo.createReviewAssignment({
      documentId,
      groupId: stage.groupId,
      label: stage.label,
      deadline: stage.deadline,
      lang,
      message: `Auto-assigned: ${stage.label} (Stage ${nextIndex + 1} of ${chain.length})`,
    });
  }

  async _handleRejection(key, chain, documentId, lang) {
    const currentStage = this._stageTracker[key];

    // Only act if the last stage (Auditor) rejects — send back to rejectionTarget
    const lastStageIndex = chain.length - 1;
    if (currentStage !== lastStageIndex) {
      console.log(`[chain] Rejection at stage ${(currentStage || 0) + 1} — not the final stage, ignoring.`);
      return null;
    }

    const rejectionTargetIndex = chain.rejectionTargetIndex !== undefined ? chain.rejectionTargetIndex : 1;
    const target = chain[rejectionTargetIndex];

    console.log(`[chain] Final stage rejected → sending back to stage ${rejectionTargetIndex + 1}: "${target.label}"`);

    // Reset tracker to the rejection target so the chain continues from there
    this._stageTracker[key] = rejectionTargetIndex;

    return await this.paligo.createReviewAssignment({
      documentId,
      groupId: target.groupId,
      label: target.label,
      deadline: target.deadline,
      lang,
      message: `Returned for revision: ${target.label} (sent back by ${chain[lastStageIndex].label})`,
    });
  }
}

module.exports = ChainHandler;
