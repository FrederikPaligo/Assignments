const chains = {
  defaultChain: Object.assign([
    { groupId: 1, label: "GAM Author Review", deadline: 30 },
    { groupId: 2, label: "GAM Reviewer Review", deadline: 30 },
    { groupId: 3, label: "GAM Approver Review", deadline: 30, rejectionTarget: 1 },
    { groupId: 4, label: "Auditor Review", deadline: 30, rejectionTarget: 1 },
  ], { completionTaxonomyId: 3062 }),
  publicationOverrides: {},
};

function getChainForPublication(documentId) {
  return chains.publicationOverrides[String(documentId)] || chains.defaultChain;
}

module.exports = { chains, getChainForPublication };
