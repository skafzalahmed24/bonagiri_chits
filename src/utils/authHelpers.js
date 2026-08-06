const isCollectionAgent = (reqUser) => {
    return Array.isArray(reqUser.introduced_as) && reqUser.introduced_as.some(x => x.id === 18 || x === 18);
};

const isBusinessAgent = (reqUser) => {
    return Array.isArray(reqUser.introduced_as) && reqUser.introduced_as.some(x => x.id === 16 || x === 16);
};

module.exports = {
    isCollectionAgent,
    isBusinessAgent
};
