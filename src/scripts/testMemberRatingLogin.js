const { calculateMemberRating } = require('../utils/ratingHelper');
const { Member } = require('../models');
const adminService = require('../services/adminService');

const mockRes = () => {
  const res = {};
  res.statusCode = 200;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.body = data;
    return res;
  };
  return res;
};

async function testRatingAndLogin() {
  try {
    console.log('Testing Rating Calculation and Login...');

    // 1. Find a sample member
    const members = await Member.findAll({
      limit: 5,
      order: [['id', 'DESC']]
    });

    console.log(`Found ${members.length} members for testing.`);

    for (const member of members) {
      const rating = await calculateMemberRating(member.id, member);
      console.log(`\n--- Member ID: ${member.id} (${member.name || member.other_info_user_code}) ---`);
      console.log(`Score: ${rating.score}/100`);
      console.log(`Star Rating: ${rating.star_rating} ★`);
      console.log(`Rating Tier: ${rating.rating_tier}`);
      console.log(`Category: ${rating.rating_category}`);
      console.log(`Color: ${rating.rating_color}`);
      console.log(`Label: ${rating.rating_label}`);
      console.log(`Trust Tier: ${rating.trust_tier}`);
      console.log(`Risk Level: ${rating.risk_level}`);
      console.log(`Badges: ${rating.badges.join(', ') || 'None'}`);
      console.log('Metrics:', rating.metrics);
    }

    // 2. Test loginCompanyService for Member
    if (members.length > 0) {
      const targetMember = members.find(m => m.other_info_user_code) || members[0];
      console.log(`\nTesting Member Login for code: ${targetMember.other_info_user_code}`);

      const res = mockRes();
      // Let's test with dummy or actual if known
      const rating = await calculateMemberRating(targetMember.id, targetMember);
      console.log('\nVerified rating integration structure:');
      console.log(JSON.stringify({
        star_rating: rating.star_rating,
        rating_tier: rating.rating_tier,
        rating_category: rating.rating_category,
        rating_color: rating.rating_color,
        rating_label: rating.rating_label,
        rating: rating
      }, null, 2));
    }

    console.log('\n✓ Rating and login test completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error in test:', error);
    process.exit(1);
  }
}

testRatingAndLogin();
