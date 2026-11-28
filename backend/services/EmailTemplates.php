<?php
declare(strict_types=1);

final class EmailTemplates
{
    /** Pure rendering only: caller owns OTP generation/hash/expiry and event deduplication. */
    public static function render(string $type, array $data): array
    {
        $templates = [
            'otp' => ['Agreement verification', 'Use this code to verify your agreement:', 'otp'],
            'rental_accepted' => ['Rental request accepted', 'Your rental request has been accepted.', 'reference'],
            'payment_due' => ['Payment due', 'Payment is due for your rental.', 'reference'],
            'deadline_missed' => ['Rental deadline missed', 'The deadline for your rental has passed. Please contact support.', 'reference'],
        ];
        if (!isset($templates[$type])) throw new InvalidArgumentException('Unknown email template.');
        [$subject, $message, $key] = $templates[$type];
        foreach (['name', $key] as $required) {
            if (!is_string($data[$required] ?? null) || trim($data[$required]) === '')
                throw new InvalidArgumentException('Required email template field missing.');
        }
        $escape = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $html = '<!doctype html><html><body><h1>' . $subject . '</h1><p>Hello '
            . $escape($data['name']) . ',</p><p>' . $message . '</p><p><strong>'
            . $escape($data[$key]) . '</strong></p>';
        if ($type === 'otp') $html .= '<p>This code expires shortly. Do not share it with anyone.</p>';
        if (isset($data['due_at']) && is_string($data['due_at'])) $html .= '<p>Due: ' . $escape($data['due_at']) . '</p>';
        return ['subject' => $subject, 'html' => $html . '<p>Equipify</p></body></html>'];
    }
}
