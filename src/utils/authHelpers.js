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

/**
 * Staff permissions travel in the login token. A role with ~100 modules written as
 * {"M_X":{"view":true}, ...} made the token ~4.8 KB, over the 4 KB browser cookie limit, so the browser dropped
 * the session cookies and the login bounced back (HTTP 307). Only `view` is ever checked, so the token now
 * carries just the list of module ids the role may view. Tokens issued earlier still carry the object form.
 */
const compactStaffPermissions = (permissions) => {
    if (Array.isArray(permissions)) return permissions;
    if (!permissions || typeof permissions !== 'object') return [];
    return Object.keys(permissions).filter((id) => permissions[id] && permissions[id].view);
};

/** True when a staff token (list form or the older object form) allows viewing the module. */
const staffCanView = (permissions, moduleId) => {
    if (Array.isArray(permissions)) return permissions.includes(moduleId);
    return Boolean(permissions && permissions[moduleId] && permissions[moduleId].view);
};

/** True when a staff token allows viewing at least one module. */
const staffHasAnyView = (permissions) => compactStaffPermissions(permissions).length > 0;

module.exports = {
    isCollectionAgent,
    isBusinessAgent,
    compactStaffPermissions,
    staffCanView,
    staffHasAnyView
};
