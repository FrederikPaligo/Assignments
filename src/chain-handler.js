/**
 * Chain Handler v2
 *
 * Handles both approvals and rejections for the review chain.
 *
 * Webhook event: ASSIGNMENT_USERSTATUS_CHANGED
 * Payload: { event, data: { resource_id, resource_title, language,
 *            assignment_type, status ("approved" | "rejected"), ... } }
 *
 * On APPROVAL:
 *   - Advance to next stage in chain
 *   - If chain complete → tag document with taxonomy
 *
 * On REJECTION:
 *   - Look up the rejectionTarget for the current stage
 *   - Create assignment for that target stage's group
 *   - Reset tracker to that stage
 */

const { getChainForPublication } = require("./config/chains");

class ChainHandler {
  constructor(paligoClient) {
    this.paligo = paligoClient;

    // In-memory stage tracker. Key = documentId, Value = current stage index.
    // In production, replace with Redis or a database.
    this._stageTracker = {};

    // Deduplication: track recent events to prevent double-processing.
    // Key = "docId:status", Value = timestamp
    this._recentEvents = {};
    this.DEDUP_WINDOW_MS = 30_000; // 30 seconds
  }

  /**
   * Main entry point — process a webhook event.
   * Returns result object or null if skipped.
   */
  async handleEvent(webhookPayload) {
    const { event, data } = webhookPayload;

    // Only process ASSIGNMENT_USERSTATUS_CHANGED
    if (event !== "ASSIGNMENT_USERSTATUS_CHANGED") {
      console.log(`[chain] Ignoring event type: ${event}`);
      return null;
    }

    const documentId = data.resource_id;
    const documentTitle = data.resource_title || "Unknown";
    const lang = data.language || "en";
    const status = data.status; // "approved" or "rejected"

    console.log(`\n[chain] ── Event received ──`);
    console.log(`[chain] Document: ${documentId} ("${documentTitle}")`);
    console.log(`[chain] Status: ${status}`);
    console.log(`[chain] Language: ${lang}`);

    // Validate status
    if (!status || !["approved", "rejected"].includes(status)) {
      console.log(`[chain] Unknown status: ${status} — skipping`);
      return null;
    }

    // Deduplication check
    const dedupKey = `${documentId}:${status}`;
    const now = Date.now();
    if (this._recentEvents[dedupKey] && (now - this._recentEvents[dedupKey]) < this.DEDUP_WINDOW_MS) {
      console.log(`[chain] Duplicate event within ${this.DEDUP_WINDOW_MS / 1000}s window — skipping`);
      return null;
    }
    this._recentEvents[dedupKey] = now;

    // Clean old dedup entries
    for (const key of Object.keys(this._recentEvents)) {
      if ((now - this._recentEvents[key]) > this.DEDUP_WINDOW_MS * 2) {
        delete this._recentEvents[key];
      }
    }

    // Get chain config
    const chain = getChainForPublication(String(documentId));

    if (status === "approved") {
      return this._handleApproval(chain, documentId, documentTitle, lang);
    } else {
      return this._handleRejection(chain, documentId, documentTitle, lang);
    }
  }

  /**
   * Handle an approval: advance to next stage, or complete chain.
   */
  async _handleApproval(chain, documentId, documentTitle, lang) {
    const key = String(documentId);
    const currentStage = this._stageTracker[key];

    let nextStageIndex;
    if (currentStage === undefined) {
      // First event for this document — assign stage 0
      nextStageIndex = 0;
    } else {
      nextStageIndex = currentStage + 1;
    }

    // Chain complete?
    if (nextStageIndex >= chain.length) {
      console.log(`[chain] Chain complete for document ${documentId}!`);

      // Tag with completion taxonomy if configured
      if (chain.completionTaxonomyId) {
        console.log(`[chain] Tagging document with taxonomy ${chain.completionTaxonomyId}`);
        try {
          await this.paligo.addTaxonomyToDocument(documentId, chain.completionTaxonomyId);
          console.log(`[chain] Taxonomy tagged successfully`);
        } catch (err) {
          console.error(`[chain] Failed to tag taxonomy:`, err.message);
        }
      }

      // Clean up tracker
      delete this._stageTracker[key];
      return { action: "chain_complete", documentId, taxonomyTagged: !!chain.completionTaxonomyId };
    }

    // Advance to next stage
    const nextStage = chain[nextStageIndex];
    const assignmentType = nextStage.type || "review";
    console.log(`[chain] APPROVED → advancing to stage ${nextStageIndex} (${nextStage.label})`);

    const result = await this.paligo.createAssignment({
      documentId,
      groupId: nextStage.groupId,
      label: nextStage.label,
      deadline: nextStage.deadline,
      type: assignmentType,
      lang,
      message: `Auto-assigned: ${nextStage.label} (Stage ${nextStageIndex + 1} of ${chain.length})`,
    });

    this._stageTracker[key] = nextStageIndex;
    return { action: "stage_advanced", stage: nextStageIndex, label: nextStage.label, result };
  }

  /**
   * Handle a rejection: jump back to the rejectionTarget stage.
   */
  async _handleRejection(chain, documentId, documentTitle, lang) {
    const key = String(documentId);
    const currentStage = this._stageTracker[key];

    if (currentStage === undefined) {
      console.log(`[chain] Rejection received but no tracked stage for document ${documentId} — ignoring`);
      return null;
    }

    const currentStageConfig = chain[currentStage];
    const rejectionTarget = currentStageConfig.rejectionTarget;

    if (rejectionTarget === undefined) {
      console.log(`[chain] Stage ${currentStage} (${currentStageConfig.label}) has no rejectionTarget — ignoring rejection`);
      return null;
    }

    const targetStage = chain[rejectionTarget];
    if (!targetStage) {
      console.error(`[chain] Invalid rejectionTarget ${rejectionTarget} for stage ${currentStage}`);
      return null;
    }

    const assignmentType = targetStage.type || "review";
    console.log(`[chain] REJECTED at stage ${currentStage} (${currentStageConfig.label}) → reverting to stage ${rejectionTarget} (${targetStage.label})`);

    const result = await this.paligo.createAssignment({
      documentId,
      groupId: targetStage.groupId,
      label: targetStage.label,
      deadline: targetStage.deadline,
      type: assignmentType,
      lang,
      message: `Revision needed: Rejected at "${currentStageConfig.label}" — reassigned to "${targetStage.label}" (Stage ${rejectionTarget + 1} of ${chain.length})`,
    });

    // Reset tracker to the target stage
    this._stageTracker[key] = rejectionTarget;
    return { action: "rejected_reverted", from: currentStage, to: rejectionTarget, label: targetStage.label, result };
  }

  /**
   * Reset tracking for a document (useful for testing).
   */
  resetTracking(documentId) {
    delete this._stageTracker[String(documentId)];
  }
}

module.exports = ChainHandler;
