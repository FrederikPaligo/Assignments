const chains = {
  defaultChain: [
    { groupId: 1, label: "Technical Review (Test 1)", deadline: 7 },
    { groupId: 2, label: "Final Approval (Test 2)", deadline: 5 },
  ],
  publicationOverrides: {},
};

function getChainForPublication(documentId) {
  return chains.publicationOverrides[String(documentId)] || chains.defaultChain;
}

module.exports = { chains, getChainForPublication };
