<?php
/**
 * Files arrive inside JSON bodies as {"name": "...", "data": "<base64>"} (the API
 * only accepts application/json). The real type is sniffed from the bytes with
 * finfo; the client-supplied name and type are never trusted or stored.
 * Saved files go to storage/uploads under a random name, which is not served
 * directly (storage/.htaccess denies access).
 */

declare(strict_types=1);

final class Upload
{
    public const IMAGES = [
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/webp' => 'webp',
    ];
    public const DOCUMENTS = ['application/pdf' => 'pdf'] + self::IMAGES;

    /**
     * Decodes and checks an uploaded file.
     *
     * @param mixed                 $file    the raw JSON value
     * @param array<string,string>  $allowed MIME type => extension
     * @return array{bytes:string,ext:string}|string the file, or an error message
     */
    public static function prepare($file, array $allowed, int $maxBytes, string $label)
    {
        $encoded = is_array($file) && is_string($file['data'] ?? null) ? $file['data'] : '';
        // Reject oversized input before decoding (base64 is ~4/3 the raw size).
        if (strlen($encoded) > (int) ceil($maxBytes * 4 / 3) + 4) {
            return $label . ' must be at most ' . intdiv($maxBytes, 1048576) . ' MB.';
        }
        $bytes = $encoded === '' ? false : base64_decode($encoded, true);
        if ($bytes === false || $bytes === '') {
            return 'Upload a valid ' . strtolower($label) . '.';
        }
        if (strlen($bytes) > $maxBytes) {
            return $label . ' must be at most ' . intdiv($maxBytes, 1048576) . ' MB.';
        }

        $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        if (!is_string($mime) || !isset($allowed[$mime])) {
            return $label . ' must be a ' . strtoupper(implode(', ', array_values($allowed))) . ' file.';
        }
        return ['bytes' => $bytes, 'ext' => $allowed[$mime]];
    }

    /** Writes a prepared file and returns its path relative to storage/ (e.g. uploads/ab12….pdf). */
    public static function store(array $prepared): string
    {
        $name = bin2hex(random_bytes(16)) . '.' . $prepared['ext'];
        $dir  = __DIR__ . '/../storage/uploads';
        if (file_put_contents($dir . '/' . $name, $prepared['bytes']) === false) {
            throw new RuntimeException('Could not save the uploaded file.');
        }
        return 'uploads/' . $name;
    }

    /** Removes a stored file (used to clean up when the database insert fails). */
    public static function discard(string $path): void
    {
        $full = __DIR__ . '/../storage/' . $path;
        if (strpos($path, 'uploads/') === 0 && is_file($full)) {
            @unlink($full);
        }
    }
}
