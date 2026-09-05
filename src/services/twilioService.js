require('dotenv').config();
const twilio = require('twilio');

const SUPPORTED_COUNTRIES = [
  { id: 101, name: 'India', code: 'IN', dialing_code: '+91', numeric_code: '91', currency: 'INR', currency_symbol: '₹', emoji: '🇮🇳' },
  { id: 233, name: 'United States', code: 'US', dialing_code: '+1', numeric_code: '1', currency: 'USD', currency_symbol: '$', emoji: '🇺🇸' },
  { id: 231, name: 'United Arab Emirates', code: 'AE', dialing_code: '+971', numeric_code: '971', currency: 'AED', currency_symbol: 'إ.د', emoji: '🇦🇪' },
  { id: 39, name: 'Canada', code: 'CA', dialing_code: '+1', numeric_code: '1', currency: 'CAD', currency_symbol: '$', emoji: '🇨🇦' },
  { id: 14, name: 'Australia', code: 'AU', dialing_code: '+61', numeric_code: '61', currency: 'AUD', currency_symbol: '$', emoji: '🇦🇺' },
  { id: 22, name: 'Belgium', code: 'BE', dialing_code: '+32', numeric_code: '32', currency: 'EUR', currency_symbol: '€', emoji: '🇧🇪' }
];

class TwilioService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.apiKeySid = process.env.TWILIO_API_KEY_SID;
    this.apiSecret = process.env.TWILIO_API_SECRET;
    this.verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;

    this.client = null;
    this.initClient();
  }

  initClient() {
    try {
      if (this.apiKeySid && this.apiSecret && this.accountSid) {
        this.client = twilio(this.apiKeySid, this.apiSecret, { accountSid: this.accountSid });
      } else if (this.accountSid && this.authToken) {
        this.client = twilio(this.accountSid, this.authToken);
      } else {
        console.warn('[TwilioService] Missing Twilio credentials. Live Twilio calls will be mocked.');
      }
    } catch (err) {
      console.error('[TwilioService] Failed to initialize Twilio client:', err.message);
      this.client = null;
    }
  }

  /**
   * Check if Static OTP mode is active (STATIC_OTP_STATUS=true)
   */
  isStaticOtp() {
    const status = String(process.env.STATIC_OTP_STATUS || '').trim().toLowerCase();
    return status === 'true' || status === '1';
  }

  isConfigured() {
    return Boolean(this.client && this.verifyServiceSid);
  }

  /**
   * List all primary supported countries
   */
  getSupportedCountries() {
    return SUPPORTED_COUNTRIES;
  }

  /**
   * Find dialing code from country name, code (ISO), or numeric dialing string
   */
  resolveDialingCode(countryInput) {
    if (!countryInput) return '+91';
    const input = String(countryInput).trim().toUpperCase().replace('+', '');
    
    // Check direct dialing code (e.g. 91, 1, 971, 61, 32)
    const byDialing = SUPPORTED_COUNTRIES.find(c => c.numeric_code === input || c.dialing_code === `+${input}`);
    if (byDialing) return byDialing.dialing_code;

    // Check ISO code (e.g. IN, US, AE, CA, AU, BE)
    const byCode = SUPPORTED_COUNTRIES.find(c => c.code === input);
    if (byCode) return byCode.dialing_code;

    // Check Name alias (e.g. DUBAI, UAE, INDIA, USA)
    if (input === 'DUBAI' || input === 'UAE') return '+971';
    if (input === 'USA') return '+1';
    if (input === 'INDIA') return '+91';
    if (input === 'CANADA') return '+1';
    if (input === 'AUSTRALIA' || input === 'AUSTIALA') return '+61';
    if (input === 'BELGIUM') return '+32';

    return '+91';
  }

  /**
   * Formats a given mobile number to standard E.164 format (+<country_code><number>)
   * Supports India (+91), USA (+1), Dubai (+971), Canada (+1), Australia (+61), Belgium (+32)
   */
  formatToE164(phone, countryCodeOrDialing = null) {
    if (!phone) return null;
    let raw = String(phone).trim();
    
    // If it already starts with '+', clean any internal non-digits and return
    if (raw.startsWith('+')) {
      const cleanDigits = raw.substring(1).replace(/\D/g, '');
      return `+${cleanDigits}`;
    }

    const cleanDigits = raw.replace(/\D/g, '');

    // If explicit country was supplied
    if (countryCodeOrDialing) {
      const dialingCode = this.resolveDialingCode(countryCodeOrDialing);
      const numericPrefix = dialingCode.replace('+', '');
      
      // If the user already typed the country prefix at the beginning of the number, strip it
      if (cleanDigits.startsWith(numericPrefix) && cleanDigits.length > numericPrefix.length + 6) {
        return `+${cleanDigits}`;
      }
      return `${dialingCode}${cleanDigits}`;
    }

    // Auto-detect common prefixes for supported countries
    if (cleanDigits.startsWith('971') && cleanDigits.length >= 11) return `+${cleanDigits}`; // UAE
    if (cleanDigits.startsWith('91') && cleanDigits.length === 12) return `+${cleanDigits}`;  // India
    if (cleanDigits.startsWith('61') && cleanDigits.length === 11) return `+${cleanDigits}`;  // Australia
    if (cleanDigits.startsWith('32') && cleanDigits.length === 11) return `+${cleanDigits}`;  // Belgium
    if (cleanDigits.startsWith('1') && cleanDigits.length === 11) return `+${cleanDigits}`;   // US/Canada

    // Default to India (+91) for 10-digit mobile numbers
    if (cleanDigits.length === 10) {
      return `+91${cleanDigits}`;
    }

    return `+${cleanDigits}`;
  }

  /**
   * Send OTP verification
   * If STATIC_OTP_STATUS=true, returns static OTP (123456) without calling Twilio.
   * If STATIC_OTP_STATUS=false, dynamically calls Twilio Verify Service.
   * @param {string} phoneNumber - Recipient mobile number
   * @param {string} channel - 'sms', 'whatsapp', or 'call'
   * @param {string} countryCode - Optional country code (IN, US, AE, CA, AU, BE)
   */
  async sendVerificationOtp(phoneNumber, channel = 'sms', countryCode = null) {
    const formattedTo = this.formatToE164(phoneNumber, countryCode);
    if (!formattedTo) {
      return { success: false, message: 'Invalid phone number provided' };
    }

    // Check if Static OTP mode is active
    if (this.isStaticOtp()) {
      console.log(`[OTP STATIC MODE] Mobile: ${formattedTo} -> Static OTP: 123456 (Twilio API bypassed)`);
      return {
        success: true,
        is_static: true,
        static_otp: '123456',
        status: 'pending',
        to: formattedTo,
        channel: channel,
        message: 'Static OTP mode active. Use code 123456'
      };
    }

    // Dynamic Twilio Verify mode
    if (!this.client || !this.verifyServiceSid) {
      console.warn(`[TwilioService MOCK] Live OTP requested for ${formattedTo} (Twilio not configured)`);
      return {
        success: true,
        mock: true,
        is_static: false,
        to: formattedTo,
        message: 'Mock dynamic OTP sent (Twilio credentials not configured)'
      };
    }

    try {
      const verification = await this.client.verify.v2
        .services(this.verifyServiceSid)
        .verifications.create({
          to: formattedTo,
          channel: channel
        });

      return {
        success: true,
        is_static: false,
        sid: verification.sid,
        status: verification.status,
        to: formattedTo,
        channel: verification.channel
      };
    } catch (error) {
      console.error('[TwilioService] Error sending verification OTP:', error);
      return {
        success: false,
        is_static: false,
        code: error.code,
        status: error.status,
        message: error.message || 'Failed to send dynamic OTP via Twilio'
      };
    }
  }

  /**
   * Verify an OTP code
   * If STATIC_OTP_STATUS=true, verifies code against 123456.
   * If STATIC_OTP_STATUS=false, verifies code with Twilio Verify Service.
   * @param {string} phoneNumber - Mobile number
   * @param {string} code - OTP code to check
   * @param {string} countryCode - Optional country code
   */
  async checkVerificationOtp(phoneNumber, code, countryCode = null) {
    const formattedTo = this.formatToE164(phoneNumber, countryCode);
    if (!formattedTo || !code) {
      return { success: false, valid: false, message: 'Phone number and OTP code are required' };
    }

    const trimmedCode = String(code).trim();

    // Check Static OTP mode
    if (this.isStaticOtp()) {
      const isValid = trimmedCode === '123456';
      console.log(`[OTP STATIC VERIFY] Mobile: ${formattedTo}, Entered: ${trimmedCode}, Result: ${isValid}`);
      return {
        success: true,
        valid: isValid,
        is_static: true,
        status: isValid ? 'approved' : 'pending',
        to: formattedTo,
        message: isValid ? 'Static OTP verified successfully' : 'Invalid static OTP (use 123456)'
      };
    }

    // Dynamic Twilio Verify mode
    if (!this.client || !this.verifyServiceSid) {
      const isValid = trimmedCode === '123456';
      return {
        success: true,
        valid: isValid,
        mock: true,
        is_static: false,
        status: isValid ? 'approved' : 'pending',
        to: formattedTo
      };
    }

    try {
      const verificationCheck = await this.client.verify.v2
        .services(this.verifyServiceSid)
        .verificationChecks.create({
          to: formattedTo,
          code: trimmedCode
        });

      const isValid = verificationCheck.status === 'approved';
      return {
        success: true,
        valid: isValid,
        is_static: false,
        status: verificationCheck.status,
        sid: verificationCheck.sid,
        to: formattedTo
      };
    } catch (error) {
      console.error('[TwilioService] Error checking verification OTP:', error);
      return {
        success: false,
        valid: false,
        is_static: false,
        code: error.code,
        message: error.message || 'Failed to verify OTP with Twilio'
      };
    }
  }

  /**
   * Send custom SMS message using Twilio Messages API
   */
  async sendCustomSms(phoneNumber, message, countryCode = null) {
    const formattedTo = this.formatToE164(phoneNumber, countryCode);
    if (!formattedTo) {
      return { success: false, message: 'Invalid phone number' };
    }

    if (this.isStaticOtp() || !this.client || !this.phoneNumber) {
      console.log(`[SMS MOCK] To: ${formattedTo} | Message: "${message}"`);
      return { success: true, mock: true, to: formattedTo };
    }

    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.phoneNumber,
        to: formattedTo
      });

      return {
        success: true,
        sid: result.sid,
        status: result.status,
        to: formattedTo
      };
    } catch (error) {
      console.error('[TwilioService] Error sending custom SMS:', error);
      return {
        success: false,
        code: error.code,
        message: error.message || 'Failed to send SMS'
      };
    }
  }
}

module.exports = new TwilioService();
