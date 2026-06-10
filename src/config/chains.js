/**
 * Review Chain Configuration — Allianz Instance
 *
 * Each stage has:
 *   - groupId:          Paligo usergroup ID to assign the review to
 *   - label:            human-readable name for logging / assignment messages
 *   - deadline:         days from creation for the review deadline
 *   - type:             assignment type ("review" or "contribution"), defaults to "review"
 *   - rejectionTarget:  (optional) stage INDEX to jump back to on rejection
 *
 * Rejection rules (confirmed by client):
 *   - Group 2 (GAM Reviewer)  rejects → back to Group 1 (GAM Author)
 *   - Group 3 (GAM Approver)  rejects → back to Group 2 (GAM Reviewer)
 *   - Group 4 (Auditor)       rejects → back to Group 2 (GAM Reviewer)
 *
 * On completion (Group 4 approves): tag document with taxonomy 3062
 * ("Staging for Release").
 */

const chains = {
  defaultChain: Object.assign(
    [
      {
        groupId: 1,
        label: "GAM Author Review",
        deadline: 30,
        type: "contribution",   // Group 1 is an author — uses contribution assignment
        // No rejectionTarget: stage 0 can't reject further back
      },
      {
        groupId: 2,
        label: "GAM Reviewer Review",
        deadline: 30,
        rejectionTarget: 0,     // Reject → back to Group 1 (GAM Author)
      },
      {
        groupId: 3,
        label: "GAM Approver Review",
        deadline: 30,
        rejectionTarget: 1,     // Reject → back to Group 2 (GAM Reviewer)
      },
      {
        groupId: 4,
        label: "Auditor Review",
        deadline: 30,
        rejectionTarget: 1,     // Reject → back to Group 2 (GAM Reviewer)
      },
    ],
    { completionTaxonomyId: 3062 }
  ),

  // Per-document overrides — keyed by document ID (as string).
  publicationOverrides: {},
};

function getChainForPublication(documentId) {
  return chains.publicationOverrides[String(documentId)] || chains.defaultChain;
}

module.exports = { chains, getChainForPublication };
