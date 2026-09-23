<?php
/**
 * Authenticated encryption for the few columns that must not be readable in a
 * database dump (today: payout account details).
 *
 *     $blob = Crypto::encrypt(['account_number' => '...'], 'payout_method:42');
 *     $data = Crypto::decrypt($blob, 'payout_method:42');   // null if tampered
 *
 * This is deliberately *not* a general "encrypt anything" helper. Passwords are
 * hashed, not encrypted, and stay with password_hash(); uploaded files stay on
 * disk behind storage/.htaccess. This is for structured values the platform has
 * to be able to read back and hand to a payment gateway.
 *
 * Cipher: XChaCha20-Poly1305 (libsodium, bundled with PHP since 7.2). AEAD, so
 * a modified ciphertext fails to decrypt rather than returning junk, and the
 * caller passes context (`$aad`) that is authenticated but not stored — binding
 * a row to its owner, so lifting a ciphertext onto another user's row breaks it.
 *
 * Stored form is "v<n>.<base64 of nonce||ciphertext>". The version prefix is
 * what makes key rotation possible later: a reader can tell which key to try.
 */

declare(strict_types=1);

final class Crypto
{
    /** Bumped when the key or the cipher changes; written into every new blob. */
    public const VERSION = 1;

    /** Where the master key lives when it isn't supplied by the environment. */
    private const KEY_FILE = __DIR__ . '/../config/app_key.php';

    private const KEY_ENV = 'EQUIPIFY_APP_KEY';

    /**
     * Encrypts an array as JSON.
     *
     * @param array<string,mixed> $data
     * @param string $aad context bound to the ciphertext (not stored in it).
     *                    Pass something that identifies the row's owner.
     */
    public static function encrypt(array $data, string $aad): string
    {
        $plaintext = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($plaintext === false) {
            throw new RuntimeException('Could not encode the value for encryption.');
        }

        $nonce  = random_bytes(SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES);
        $cipher = sodium_crypto_aead_xchacha20poly1305_ietf_encrypt(
            $plaintext,
            $aad,
            $nonce,
            self::subkey('enc')
        );

        // Base64 rather than raw bytes: the column is utf8mb4 text, so binary
        // would have to survive a charset round-trip it has no business in.
        return 'v' . self::VERSION . '.' . base64_encode($nonce . $cipher);
    }

    /**
     * Reverses encrypt(). Returns null when the blob is malformed, was written
     * with a key version this build cannot read, or fails its authentication
     * tag — which is also what happens when $aad does not match.
     *
     * @return array<string,mixed>|null
     */
    public static function decrypt(string $blob, string $aad): ?array
    {
        $dot = strpos($blob, '.');
        if ($dot === false || substr($blob, 0, 1) !== 'v') {
            return null;
        }
        if ((int) substr($blob, 1, $dot - 1) !== self::VERSION) {
            return null;
        }

        $raw = base64_decode(substr($blob, $dot + 1), true);
        $nonceBytes = SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES;
        if ($raw === false || strlen($raw) <= $nonceBytes) {
            return null;
        }

        $plaintext = sodium_crypto_aead_xchacha20poly1305_ietf_decrypt(
            substr($raw, $nonceBytes),
            $aad,
            substr($raw, 0, $nonceBytes),
            self::subkey('enc')
        );
        if ($plaintext === false) {
            return null;
        }

        $data = json_decode($plaintext, true);
        return is_array($data) ? $data : null;
    }

    /**
     * A stable, keyed hash of a value, for the "have I seen this before?"
     * question that a random nonce makes impossible to ask of the ciphertext.
     *
     * Keyed on purpose: an account number is short and structured, so a plain
     * SHA-256 of one could be recovered from a dump by trying every candidate.
     * An HMAC cannot be, without the key.
     */
    public static function fingerprint(string $value, string $domain): string
    {
        return hash_hmac('sha256', $domain . ':' . $value, self::subkey('mac'));
    }

    /**
     * A purpose-specific key derived from the master key, so the value used to
     * encrypt is never the same one used to fingerprint.
     */
    private static function subkey(string $purpose): string
    {
        static $cache = [];
        if (!isset($cache[$purpose])) {
            $cache[$purpose] = hash_hkdf(
                'sha256',
                self::masterKey(),
                SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_KEYBYTES,
                'equipify:v' . self::VERSION . ':' . $purpose
            );
        }
        return $cache[$purpose];
    }

    /**
     * The 32-byte master key, from $EQUIPIFY_APP_KEY if it is set, otherwise
     * from config/app_key.php, which is generated on first use and is git
     * ignored. Losing that file means every encrypted value becomes
     * unreadable, so it belongs in a backup and never in the repository.
     */
    private static function masterKey(): string
    {
        static $key = null;
        if ($key !== null) {
            return $key;
        }

        $fromEnv = getenv(self::KEY_ENV);
        if (is_string($fromEnv) && $fromEnv !== '') {
            return $key = self::decodeKey($fromEnv, 'The ' . self::KEY_ENV . ' environment variable');
        }

        if (is_file(self::KEY_FILE)) {
            $stored = require self::KEY_FILE;
            return $key = self::decodeKey(
                is_string($stored) ? $stored : '',
                'The key in backend/config/app_key.php'
            );
        }

        return $key = self::generateKeyFile();
    }

    /** @return string the 32 raw bytes */
    private static function decodeKey(string $encoded, string $label): string
    {
        $raw = base64_decode(trim($encoded), true);
        if ($raw === false || strlen($raw) !== SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_KEYBYTES) {
            throw new RuntimeException(
                $label . ' is not a valid key: it must be 32 random bytes, base64 encoded.'
            );
        }
        return $raw;
    }

    /**
     * Writes a fresh random key on first run, so a teammate who clones the repo
     * gets a working install without a setup step. Written read/write to the
     * owner only, and never committed.
     */
    private static function generateKeyFile(): string
    {
        $raw  = random_bytes(SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_KEYBYTES);
        $body = "<?php\n"
            . "// Generated automatically on first use. NEVER COMMIT THIS FILE.\n"
            . "// Back it up: if it is lost, every encrypted payout detail is lost with it.\n"
            . "// To move an install to another machine, copy this value across, or set\n"
            . "// the " . self::KEY_ENV . " environment variable to it instead.\n"
            . "return '" . base64_encode($raw) . "';\n";

        // Create it unreadable to anyone else *before* the key lands in it,
        // rather than writing first and fixing the mode afterwards.
        $handle = @fopen(self::KEY_FILE, 'x');
        if ($handle === false) {
            throw new RuntimeException(
                'Could not create backend/config/app_key.php. Create it manually, or set '
                . self::KEY_ENV . ' to 32 base64-encoded random bytes.'
            );
        }
        @chmod(self::KEY_FILE, 0600);
        fwrite($handle, $body);
        fclose($handle);

        return $raw;
    }
}
