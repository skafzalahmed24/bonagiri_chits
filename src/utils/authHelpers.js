const isCollectionAgent = (reqUser) => {
    if (!reqUser || !reqUser.introduced_as) return false;
    let list = reqUser.introduced_as;
    if (typeof list === 'string') {
        try { list = JSON.parse(list); } catch (e) { list = [list]; }
    }
    if (!Array.isArray(list)) {
        list = [list];
    }
    return list.some(x => (typeof x === 'object' && x !== null ? (x.id === 18 || x.id === '18' || Number(x.id) === 18) : (x === 18 || x === '18' || Number(x) === 18)));
};

const isBusinessAgent = (reqUser) => {
    if (!reqUser || !reqUser.introduced_as) return false;
    let list = reqUser.introduced_as;
    if (typeof list === 'string') {
        try { list = JSON.parse(list); } catch (e) { list = [list]; }
    }
    if (!Array.isArray(list)) {
        list = [list];
    }
    return list.some(x => (typeof x === 'object' && x !== null ? (x.id === 16 || x.id === '16' || Number(x.id) === 16) : (x === 16 || x === '16' || Number(x) === 16)));
};

module.exports = {
    isCollectionAgent,
    isBusinessAgent
};
