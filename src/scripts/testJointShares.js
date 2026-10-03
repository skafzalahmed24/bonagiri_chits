function getMemberShareRatio(enr, currentMemberId) {
    const jointList = (enr.joint_holders || []).filter(j => !j.removed_on);
    const joint = jointList.find(j => Number(j.member_id) === Number(currentMemberId));
    if (joint) {
        return (parseFloat(joint.share_percent) || 0) / 100;
    }
    if (Number(enr.subscriber_id) === Number(currentMemberId)) {
        const jointTotal = jointList.reduce((sum, j) => sum + (parseFloat(j.share_percent) || 0), 0);
        const mainShare = parseFloat(enr.main_holder_share);
        if (!isNaN(mainShare)) return mainShare / 100;
        return (jointList.length > 0 ? Math.max(0, 100 - jointTotal) : 100) / 100;
    }
    return 1.0;
}

// Test cases for enrollment 250 (Member 3 is main holder, Member 4 is 50% joint holder)
const enrJoint = {
    id: 250,
    subscriber_id: 87,
    main_holder_share: '50.00',
    joint_holders: [
        { id: 10, member_id: 88, share_percent: '50.00', removed_on: null, member: { id: 88, name: 'Member 4' } }
    ],
    subscriber: { id: 87, name: 'Member 3' }
};

console.log('Member 3 share ratio:', getMemberShareRatio(enrJoint, 87));
console.log('Member 4 share ratio:', getMemberShareRatio(enrJoint, 88));

if (getMemberShareRatio(enrJoint, 87) !== 0.5 || getMemberShareRatio(enrJoint, 88) !== 0.5) {
    console.error('Share ratio calculation failed');
    process.exit(1);
}

// Test single holder
const enrSingle = {
    id: 240,
    subscriber_id: 84,
    main_holder_share: null,
    joint_holders: [],
    subscriber: { id: 84, name: 'Member 1' }
};

console.log('Member 1 share ratio:', getMemberShareRatio(enrSingle, 84));
if (getMemberShareRatio(enrSingle, 84) !== 1.0) {
    console.error('Single share ratio failed');
    process.exit(1);
}

console.log('All joint share tests passed successfully!');
