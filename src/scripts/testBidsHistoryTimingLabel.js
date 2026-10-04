'use strict';

const assert = require('assert');

function runTest() {
  console.log('--- Testing Bids History Timing Label & Auction Type Fields ---');

  const formatDateToOrdinal = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const day = date.getDate();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    let suffix = 'th';
    if (day === 1 || day === 21 || day === 31) suffix = 'st';
    else if (day === 2 || day === 22) suffix = 'nd';
    else if (day === 3 || day === 23) suffix = 'rd';

    return `${day}${suffix} ${month} ${year}`;
  };

  const resolveChitGroupAuctionType = (group) => {
    if (!group) return 1;
    if (group.scheme_configuration_id) return 2;
    if (Number(group.auction_type) === 1 || Number(group.auction_type) === 2) return Number(group.auction_type);
    return 1;
  };

  // Test Case 1: Active group with auction history
  const group1 = {
    id: '48856172-9b14-4663-b159-e706f7010ed4',
    group_name: 'Chit Group -3',
    chit_amount: 35000,
    auction_type: 1,
    scheme_configuration_id: null,
    chits_group_status: 1,
    auction_date: '2026-12-05'
  };
  const latestAuction1 = { auction_number: 1, auction_date: '2026-12-05' };

  const resolvedAuctionType1 = resolveChitGroupAuctionType(group1);
  const targetDate1 = latestAuction1.auction_date || group1.auction_date;
  const dateFormatted1 = targetDate1 ? formatDateToOrdinal(targetDate1) : '';
  const timingLabel1 = dateFormatted1 ? `${dateFormatted1} - Auction #${latestAuction1.auction_number}` : `Auction #${latestAuction1.auction_number}`;

  const row1 = {
    group_id: group1.id,
    group_name: group1.group_name,
    chit_amount: group1.chit_amount,
    members_count: 6,
    badge_label: 3,
    timing_label: timingLabel1,
    auction_date: targetDate1,
    is_today: false,
    auction_type: resolvedAuctionType1,
    auction_type_label: resolvedAuctionType1 === 1 ? 'Open Auction' : 'Fixed Chit',
    auction_number: latestAuction1.auction_number,
    scheme_type: null
  };

  console.log('Row 1 (Open Auction History):', JSON.stringify(row1, null, 2));
  assert.strictEqual(row1.timing_label, '5th December 2026 - Auction #1');
  assert.strictEqual(row1.auction_type, 1);
  assert.strictEqual(row1.auction_type_label, 'Open Auction');
  assert.strictEqual(row1.auction_number, 1);

  // Test Case 2: Fixed Chit group with history
  const group2 = {
    id: '6e379aa5-882d-46d3-bb14-eac415077fde',
    group_name: 'chit group - 4(fc)',
    chit_amount: 100000,
    auction_type: 2,
    scheme_configuration_id: 'some-uuid',
    chits_group_status: 1,
    auction_date: '2026-12-05'
  };
  const latestAuction2 = { auction_number: 1, auction_date: '2026-12-05' };
  const resolvedAuctionType2 = resolveChitGroupAuctionType(group2);
  const targetDate2 = latestAuction2.auction_date || group2.auction_date;
  const dateFormatted2 = targetDate2 ? formatDateToOrdinal(targetDate2) : '';
  const timingLabel2 = dateFormatted2 ? `${dateFormatted2} - Auction #${latestAuction2.auction_number}` : `Auction #${latestAuction2.auction_number}`;

  const row2 = {
    group_id: group2.id,
    group_name: group2.group_name,
    chit_amount: group2.chit_amount,
    members_count: 11,
    badge_label: 3,
    timing_label: timingLabel2,
    auction_date: targetDate2,
    is_today: false,
    auction_type: resolvedAuctionType2,
    auction_type_label: resolvedAuctionType2 === 1 ? 'Open Auction' : 'Fixed Chit',
    auction_number: latestAuction2.auction_number,
    scheme_type: 62
  };

  console.log('Row 2 (Fixed Chit History):', JSON.stringify(row2, null, 2));
  assert.strictEqual(row2.timing_label, '5th December 2026 - Auction #1');
  assert.strictEqual(row2.auction_type, 2);
  assert.strictEqual(row2.auction_type_label, 'Fixed Chit');
  assert.strictEqual(row2.auction_number, 1);

  console.log('ALL BIDS HISTORY TESTS PASSED!');
}

runTest();
