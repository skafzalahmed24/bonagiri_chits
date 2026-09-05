require('dotenv').config();
const twilioService = require('../services/twilioService');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const phone = args[1];
  const arg3 = args[2]; // Can be code (if verify) or country_code (if send)
  const arg4 = args[3]; // Can be country_code (if verify)

  console.log('==============================================');
  console.log('       BONAGIRI CHITS OTP TEST TOOL           ');
  console.log('==============================================');
  console.log('STATIC_OTP_STATUS:', process.env.STATIC_OTP_STATUS, `(${twilioService.isStaticOtp() ? 'Static OTP 123456 active' : 'Dynamic live Twilio active'})`);
  console.log('Twilio configured:', twilioService.isConfigured());
  console.log('Verify Service SID:', process.env.TWILIO_VERIFY_SERVICE_SID);
  console.log('\nSupported Countries:');
  twilioService.getSupportedCountries().forEach(c => {
    console.log(`  ${c.emoji} ${c.name} (${c.code}): ${c.dialing_code} [Currency: ${c.currency_symbol} ${c.currency}]`);
  });
  console.log('==============================================');

  if (!command || !phone) {
    console.log('\nUsage:');
    console.log('  node src/scripts/testTwilioOtp.js send <phone_number> [country_code]');
    console.log('  node src/scripts/testTwilioOtp.js verify <phone_number> <otp_code> [country_code]');
    console.log('\nExamples:');
    console.log('  node src/scripts/testTwilioOtp.js send 9876543210 IN');
    console.log('  node src/scripts/testTwilioOtp.js send 501234567 AE        (Dubai/UAE)');
    console.log('  node src/scripts/testTwilioOtp.js send 4155552671 US       (USA)');
    console.log('  node src/scripts/testTwilioOtp.js send 412345678 AU        (Australia)');
    console.log('  node src/scripts/testTwilioOtp.js verify 9876543210 123456 IN');
    process.exit(0);
  }

  if (command === 'send') {
    const country = arg3 || null;
    const formatted = twilioService.formatToE164(phone, country);
    console.log(`\nSending OTP to: ${phone} (Country: ${country || 'Auto/Default'}, E.164: ${formatted})...`);
    const result = await twilioService.sendVerificationOtp(phone, 'sms', country);
    console.log('\nResult:', JSON.stringify(result, null, 2));
  } else if (command === 'verify') {
    const code = arg3;
    const country = arg4 || null;
    if (!code) {
      console.error('Error: Please provide the OTP code to verify.');
      process.exit(1);
    }
    const formatted = twilioService.formatToE164(phone, country);
    console.log(`\nVerifying OTP "${code}" for: ${phone} (Country: ${country || 'Auto/Default'}, E.164: ${formatted})...`);
    const result = await twilioService.checkVerificationOtp(phone, code, country);
    console.log('\nResult:', JSON.stringify(result, null, 2));
  } else {
    console.error(`Unknown command: ${command}`);
  }
}

main().catch(err => console.error('Fatal error:', err));
