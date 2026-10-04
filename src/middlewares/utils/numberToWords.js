'use strict';

// Indian numbering: thousand, lakh, crore. The statutory forms print amounts as
// "Rs. 500,000/- (Rupees Five Lakhs Only)", so words and figures must agree.

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const underThousand = (n) => {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + underThousand(n % 100) : '');
};

/**
 * 500000 -> "Five Lakhs". Plural follows how the old system prints it
 * ("Five Lakhs", "Thirty Five Lakhs"), and 0 -> "Zero".
 */
function numberToWordsIndian(value) {
  const n = Math.floor(Math.abs(Number(value) || 0));
  if (n === 0) return 'Zero';

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;

  const parts = [];
  if (crore) parts.push(underThousand(crore) + (crore > 1 ? ' Crores' : ' Crore'));
  if (lakh) parts.push(underThousand(lakh) + (lakh > 1 ? ' Lakhs' : ' Lakh'));
  if (thousand) parts.push(underThousand(thousand) + ' Thousand');
  if (rest) parts.push(underThousand(rest));

  const words = parts.join(' ').replace(/\s+/g, ' ').trim();
  return Number(value) < 0 ? 'Minus ' + words : words;
}

/** "Five Lakhs Only" — the suffix the forms use after an amount. */
const amountInWords = (value) => numberToWordsIndian(value) + ' Only';

module.exports = { numberToWordsIndian, amountInWords };
