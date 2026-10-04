const { formatPenaltyCalculationText } = require('../services/userService');

function test() {
    console.log('Testing formatPenaltyCalculationText:');
    console.log('1. 6200 with 31 days:', formatPenaltyCalculationText(6200, 31));
    console.log('2. 200 with 1 day:', formatPenaltyCalculationText(200, 1));
    console.log('3. 0 with 0 days:', formatPenaltyCalculationText(0, 0));
    console.log('4. 100 with 5 days:', formatPenaltyCalculationText(100, 5));
}

test();
