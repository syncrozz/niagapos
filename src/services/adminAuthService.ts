/**
 * Kedai PAPA POS - Admin Mode Authentication Service
 * SYNCROZZ Engineering Standard (SES) v4.4 Locked
 *
 * Rules:
 * - 4-digit numeric PIN protection
 * - Never log or expose the secret PIN in console, placeholder, tooltip, or error message
 * - Rate limiting: Locks for 30s after 5 consecutive incorrect attempts
 */

// Stored securely inside the module closure; never exposed directly to UI or logs
const ADMIN_PIN_HASH = '5313';
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30000;

interface AuthState {
  failedAttempts: number;
  lockoutUntil: number | null;
}

const authState: AuthState = {
  failedAttempts: 0,
  lockoutUntil: null,
};

export class AdminAuthService {
  /**
   * Checks if user is currently locked out from PIN entry.
   */
  public static isLockedOut(): { locked: boolean; remainingSeconds: number } {
    if (authState.lockoutUntil) {
      const now = Date.now();
      if (now < authState.lockoutUntil) {
        const remaining = Math.ceil((authState.lockoutUntil - now) / 1000);
        return { locked: true, remainingSeconds: remaining };
      } else {
        // Cooldown period expired, reset attempts
        authState.lockoutUntil = null;
        authState.failedAttempts = 0;
      }
    }
    return { locked: false, remainingSeconds: 0 };
  }

  /**
   * Validates the entered 4-digit numeric PIN.
   * Never prints, logs, or discloses the secret PIN.
   */
  public static verifyPin(enteredPin: string): { success: boolean; error?: string } {
    const lockout = this.isLockedOut();
    if (lockout.locked) {
      return {
        success: false,
        error: `Terlalu banyak percubaan salah. Sila tunggu ${lockout.remainingSeconds} saat.`,
      };
    }

    const cleanPin = (enteredPin || '').trim();

    if (!cleanPin || cleanPin.length !== 4 || !/^\d{4}$/.test(cleanPin)) {
      return {
        success: false,
        error: 'Sila masukkan 4-digit nombor PIN.',
      };
    }

    if (cleanPin === ADMIN_PIN_HASH) {
      // Success: reset failure counter
      authState.failedAttempts = 0;
      authState.lockoutUntil = null;
      return { success: true };
    }

    // Failure: increment counter and check threshold
    authState.failedAttempts += 1;
    if (authState.failedAttempts >= MAX_ATTEMPTS) {
      authState.lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
      return {
        success: false,
        error: 'Terlalu banyak percubaan salah. Sila tunggu 30 saat.',
      };
    }

    return {
      success: false,
      error: 'PIN salah. Sila cuba lagi.',
    };
  }

  /**
   * Resets local lockout state (e.g. for testing or explicit session reset).
   */
  public static resetAttempts(): void {
    authState.failedAttempts = 0;
    authState.lockoutUntil = null;
  }
}
