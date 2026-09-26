<?php
/**
 * The signed-in customer's own profile. The customer is always taken from the
 * session, never from the request, so there is no way to read someone else's row.
 */

declare(strict_types=1);

require_once __DIR__ . '/../models/CustomerModel.php';

final class CustomerController
{
    /** GET /customer/profile */
    public static function showProfile(array $params = []): void
    {
        $profile = CustomerModel::findProfile((int) Auth::userId());
        if ($profile === null) {
            Response::error('Profile not found.', 404);
        }
        Response::ok(self::presentProfile($profile));
    }

    private static function presentProfile(array $row): array
    {
        $fwAvg   = (float) $row['freelancer_avg_rating'];
        $fwCount = (int) $row['freelancer_rating_count'];
        $rpAvg   = (float) $row['renting_party_avg_rating'];
        $rpCount = (int) $row['renting_party_rating_count'];
        $count   = $fwCount + $rpCount;

        return [
            'user_id'                    => (int) $row['user_id'],
            'full_name'                  => $row['full_name'],
            'email'                      => $row['email'],
            'phone'                      => $row['phone'],
            'company_name'               => $row['company_name'],
            'address_line'               => $row['address_line'] ?? $row['billing_address'],
            'district'                   => $row['district'],
            'member_since'               => $row['created_at'],
            'freelancer_avg_rating'      => $fwAvg,
            'freelancer_rating_count'    => $fwCount,
            'renting_party_avg_rating'   => $rpAvg,
            'renting_party_rating_count' => $rpCount,
            // Both sources combined, weighted by how many ratings each has.
            'avg_rating'                 => $count === 0 ? 0.0 : round(($fwAvg * $fwCount + $rpAvg * $rpCount) / $count, 2),
            'rating_count'               => $count,
        ];
    }
}
