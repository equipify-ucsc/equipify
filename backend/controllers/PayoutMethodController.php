<?php
/**
 * Where a professional's earnings get sent.
 *
 * Equipify does not move money itself: a job is paid through PayHere, and
 * PayHere needs a destination for the operator's share. That destination is
 * what this controller stores.
 *
 * Two things shape the design.
 *
 * 1. The catalogue is PayHere's, not ours. An operator picks a named method
 *    from PROVIDERS below rather than typing free text, so what we hold is
 *    always something the gateway can actually be handed. Each entry says which
 *    CATEGORY it belongs to, and the category decides which fields are asked
 *    for and how they are checked. PayHere settles merchant balances to a local
 *    bank account, so `bank_account` is the rail that pays out today; the wallet
 *    categories are PayHere-supported instruments modelled alongside it, and
 *    adding one is a line in PROVIDERS rather than a schema change.
 *
 * 2. Account details are never stored readable. The holder's name, the account
 *    or mobile number and the branch are sealed into one AEAD ciphertext by
 *    core/Crypto.php before they reach the model, bound to the owning user id,
 *    and the plaintext is not written to the response either: a saved method
 *    comes back masked ("•••• 4321"). Re-reading an account number is not
 *    something the page needs, so nothing here offers it.
 *
 * The table is keyed on user_id rather than on the freelance_workers subtype,
 * because delivery personnel are paid through the platform too. Only the
 * freelance_worker role is routed here for now; widening it is a change to
 * routes.php alone.
 */

declare(strict_types=1);

require_once __DIR__ . '/../models/PayoutMethodModel.php';
require_once __DIR__ . '/../core/Crypto.php';

final class PayoutMethodController
{
    /**
     * The payout destinations an operator can choose, keyed by the value that
     * is stored. Names are PayHere's own spelling of each method.
     *
     * `category` drives validation and the shape of the form:
     *   bank_account   — a local bank account: holder, account number, branch.
     *   mobile_wallet  — a telco wallet, addressed by mobile number.
     *   digital_wallet — a bank-backed wallet or app, also by mobile number.
     */
    private const PROVIDERS = [
        // Licensed commercial banks. PayHere pays merchant balances out by
        // local bank transfer, so this is the category that matters most.
        'boc'        => ['category' => 'bank_account',   'name' => 'Bank of Ceylon'],
        'commercial' => ['category' => 'bank_account',   'name' => 'Commercial Bank of Ceylon'],
        'sampath'    => ['category' => 'bank_account',   'name' => 'Sampath Bank'],
        'hnb'        => ['category' => 'bank_account',   'name' => 'Hatton National Bank'],
        'peoples'    => ['category' => 'bank_account',   'name' => "People's Bank"],
        'nsb'        => ['category' => 'bank_account',   'name' => 'National Savings Bank'],
        'seylan'     => ['category' => 'bank_account',   'name' => 'Seylan Bank'],
        'ntb'        => ['category' => 'bank_account',   'name' => 'Nations Trust Bank'],
        'dfcc'       => ['category' => 'bank_account',   'name' => 'DFCC Bank'],
        'pan_asia'   => ['category' => 'bank_account',   'name' => 'Pan Asia Bank'],
        'union'      => ['category' => 'bank_account',   'name' => 'Union Bank'],

        // Telco wallets PayHere supports.
        'ezcash'     => ['category' => 'mobile_wallet',  'name' => 'eZ Cash'],
        'mcash'      => ['category' => 'mobile_wallet',  'name' => 'mCash'],

        // Bank-backed wallets PayHere supports.
        'frimi'      => ['category' => 'digital_wallet', 'name' => 'FriMi'],
        'genie'      => ['category' => 'digital_wallet', 'name' => 'Genie'],
    ];

    /** payout_methods.category, in the order the picker should group them. */
    private const CATEGORIES = [
        'bank_account'   => 'Bank account',
        'mobile_wallet'  => 'Mobile wallet',
        'digital_wallet' => 'Digital wallet',
    ];

    /**
     * More than this and the list stops being a list. It also caps how much
     * encrypted material one account can accumulate.
     */
    private const MAX_PER_USER = 8;

    /**
     * GET /freelancer/payout-providers
     *
     * The catalogue, so the page builds its picker from the same source the
     * server validates against and the two cannot drift apart.
     */
    public static function indexProviders(array $params = []): void
    {
        $categories = [];
        foreach (self::CATEGORIES as $key => $label) {
            $categories[] = [
                'category'  => $key,
                'label'     => $label,
                // What the form must collect for anything in this category.
                'fields'    => $key === 'bank_account'
                    ? ['account_name', 'account_number', 'branch']
                    : ['account_name', 'mobile_number'],
                'providers' => [],
            ];
        }
        $byCategory = array_column($categories, null, 'category');

        foreach (self::PROVIDERS as $key => $provider) {
            $byCategory[$provider['category']]['providers'][] = [
                'provider' => $key,
                'name'     => $provider['name'],
            ];
        }

        Response::ok(['categories' => array_values($byCategory)]);
    }

    /** GET /freelancer/payout-methods */
    public static function index(array $params = []): void
    {
        $userId = (int) Auth::userId();
        $rows   = PayoutMethodModel::allForUser($userId);

        Response::ok([
            'items' => array_map(
                static fn (array $row): array => self::present($row, $userId),
                $rows
            ),
            'max'   => self::MAX_PER_USER,
        ]);
    }

    /**
     * POST /freelancer/payout-methods
     *
     * The body carries the account details in the clear over HTTPS, once. They
     * are encrypted here and are not readable again through the API.
     */
    public static function store(array $params = []): void
    {
        $userId = (int) Auth::userId();
        $in     = Router::jsonBody();

        if (PayoutMethodModel::countForUser($userId) >= self::MAX_PER_USER) {
            Response::error(
                'You can save up to ' . self::MAX_PER_USER . ' payout methods. Remove one first.',
                409
            );
        }

        $label    = self::str($in, 'label');
        $provider = self::str($in, 'provider');

        $errors = [];
        if ($message = Validator::required($label, 'Name') ?? Validator::maxLength($label, 60, 'Name')) {
            $errors['label'] = $message;
        }
        if ($message = Validator::oneOf($provider, array_keys(self::PROVIDERS), 'payout method')) {
            $errors['provider'] = $message;
        }

        // The details differ per category, so they are collected and checked by
        // the category's own reader, which returns both the fields to seal and
        // any per-field messages. It can only run once the provider is known,
        // since the provider is what says which category this is — but its
        // messages are merged with the ones above rather than reported in a
        // second round, so the form highlights everything at once.
        if (isset($errors['provider'])) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        $category = self::PROVIDERS[$provider]['category'];
        [$details, $detailErrors] = $category === 'bank_account'
            ? self::readBankAccount($in)
            : self::readWallet($in);

        $errors += $detailErrors;
        if ($errors !== []) {
            Response::error('Please fix the highlighted fields.', 422, $errors);
        }

        // The fingerprint is over the account number alone, scoped by provider:
        // the same digits at two different banks are two different accounts.
        $fingerprint = Crypto::fingerprint($details['identifier'], 'payout:' . $provider);
        if (PayoutMethodModel::fingerprintExists($userId, $fingerprint)) {
            Response::error('Please fix the highlighted fields.', 422, [
                self::identifierField($category) => 'You have already saved this account.',
            ]);
        }

        // First method saved becomes the default whatever the request says:
        // an account with methods but no default has nowhere to be paid.
        $isDefault = !empty($in['is_default']) || PayoutMethodModel::countForUser($userId) === 0;

        try {
            $methodId = PayoutMethodModel::insert($userId, [
                'label'               => $label,
                'category'            => $category,
                'provider'            => $provider,
                'details_cipher'      => Crypto::encrypt($details['sealed'], self::aad($userId)),
                'details_fingerprint' => $fingerprint,
                'key_version'         => Crypto::VERSION,
                'is_default'          => $isDefault,
            ]);
        } catch (PDOException $e) {
            // Lost a race with a second tab saving the same account.
            if ($e->getCode() === '23000') {
                Response::error('Please fix the highlighted fields.', 422, [
                    self::identifierField($category) => 'You have already saved this account.',
                ]);
            }
            throw $e;
        }

        Response::ok(
            self::present((array) PayoutMethodModel::findForUser($methodId, $userId), $userId),
            201
        );
    }

    /** POST /freelancer/payout-methods/{id}/default */
    public static function makeDefault(array $params = []): void
    {
        $userId   = (int) Auth::userId();
        $methodId = self::idParam($params);

        if ($methodId === null || !PayoutMethodModel::makeDefault($methodId, $userId)) {
            Response::error('Payout method not found.', 404);
        }

        Response::ok([
            'items' => array_map(
                static fn (array $row): array => self::present($row, $userId),
                PayoutMethodModel::allForUser($userId)
            ),
        ]);
    }

    /** DELETE /freelancer/payout-methods/{id} */
    public static function destroy(array $params = []): void
    {
        $userId   = (int) Auth::userId();
        $methodId = self::idParam($params);

        if ($methodId === null || !PayoutMethodModel::delete($methodId, $userId)) {
            Response::error('Payout method not found.', 404);
        }

        Response::ok([
            'items' => array_map(
                static fn (array $row): array => self::present($row, $userId),
                PayoutMethodModel::allForUser($userId)
            ),
        ]);
    }

    // ------------------------------------------------------- category readers

    /**
     * A local bank account. The account number is digits only: Sri Lankan banks
     * run between about 6 and 20 of them depending on the bank, so the range is
     * deliberately wide rather than wrong for one of them.
     *
     * @return array{0:array{identifier:string,sealed:array<string,string>},1:array<string,string>}
     */
    private static function readBankAccount(array $in): array
    {
        $holder = self::str($in, 'account_name');
        $number = preg_replace('/[\s\-]/', '', self::str($in, 'account_number'));
        $branch = self::str($in, 'branch');

        $errors = [];
        if ($m = Validator::required($holder, 'Account holder name') ?? Validator::maxLength($holder, 150, 'Account holder name')) {
            $errors['account_name'] = $m;
        }
        if ($number === '') {
            $errors['account_number'] = 'Account number is required.';
        } elseif (preg_match('/^\d{6,20}$/', (string) $number) !== 1) {
            $errors['account_number'] = 'Enter a valid account number (6 to 20 digits).';
        }
        if ($m = Validator::required($branch, 'Branch') ?? Validator::maxLength($branch, 100, 'Branch')) {
            $errors['branch'] = $m;
        }

        return [[
            'identifier' => (string) $number,
            'sealed'     => [
                'account_name'   => $holder,
                'account_number' => (string) $number,
                'branch'         => $branch,
            ],
        ], $errors];
    }

    /**
     * A wallet, addressed by the mobile number it is registered to. Normalised
     * to +94XXXXXXXXX so the same number typed as 077… and +9477… fingerprints
     * identically and is caught as a duplicate.
     *
     * @return array{0:array{identifier:string,sealed:array<string,string>},1:array<string,string>}
     */
    private static function readWallet(array $in): array
    {
        $holder = self::str($in, 'account_name');
        $raw    = self::str($in, 'mobile_number');

        $errors = [];
        if ($m = Validator::required($holder, 'Account holder name') ?? Validator::maxLength($holder, 150, 'Account holder name')) {
            $errors['account_name'] = $m;
        }
        if ($m = Validator::phone($raw)) {
            $errors['mobile_number'] = $m;
        }

        $mobile = isset($errors['mobile_number']) ? '' : (string) Validator::normalizePhone($raw);

        return [[
            'identifier' => $mobile,
            'sealed'     => [
                'account_name'  => $holder,
                'mobile_number' => $mobile,
            ],
        ], $errors];
    }

    // ------------------------------------------------------------- presenting

    /**
     * Shapes a stored row for the page. The ciphertext is opened only to build
     * the masked display string and the holder's name; the account number
     * itself does not leave the server.
     *
     * A row that will not decrypt is shown rather than hidden, so an operator
     * whose key was rotated out sees a method they can delete and re-add
     * instead of a payout destination that quietly vanished.
     *
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private static function present(array $row, int $userId): array
    {
        $details  = Crypto::decrypt((string) $row['details_cipher'], self::aad($userId));
        $category = (string) $row['category'];
        $provider = (string) $row['provider'];

        $identifier = $details === null
            ? ''
            : (string) ($details[$category === 'bank_account' ? 'account_number' : 'mobile_number'] ?? '');

        return [
            'payout_method_id' => (int) $row['payout_method_id'],
            'label'            => $row['label'],
            'category'         => $category,
            'category_label'   => self::CATEGORIES[$category] ?? $category,
            'provider'         => $provider,
            'provider_name'    => self::PROVIDERS[$provider]['name'] ?? $provider,
            'account_name'     => $details === null ? null : ($details['account_name'] ?? null),
            'branch'           => $details === null ? null : ($details['branch'] ?? null),
            'masked_account'   => $identifier === '' ? null : self::mask($identifier),
            'is_default'       => (bool) $row['is_default'],
            'created_at'       => $row['created_at'],
            // True when the stored blob could not be opened with the current
            // key, so the page can say so instead of showing blanks.
            'unreadable'       => $details === null,
        ];
    }

    /** "0771234567" -> "•••• 4567". Short values are hidden entirely. */
    private static function mask(string $identifier): string
    {
        return mb_strlen($identifier) <= 4 ? '••••' : '•••• ' . mb_substr($identifier, -4);
    }

    /**
     * The associated data every blob is sealed with. It ties a ciphertext to
     * the account that owns it, so a row moved to another user_id fails to
     * decrypt rather than handing that user a working payout destination.
     */
    private static function aad(int $userId): string
    {
        return 'payout_method:user:' . $userId;
    }

    /** Which form field a duplicate-account message belongs under. */
    private static function identifierField(string $category): string
    {
        return $category === 'bank_account' ? 'account_number' : 'mobile_number';
    }

    /** The {id} path segment as a positive int, or null when it isn't one. */
    private static function idParam(array $params): ?int
    {
        $id = filter_var($params['id'] ?? null, FILTER_VALIDATE_INT);
        return ($id === false || $id < 1) ? null : $id;
    }

    /** Trimmed string input, or '' when missing / not a string. */
    private static function str(array $in, string $key): string
    {
        return is_string($in[$key] ?? null) ? trim($in[$key]) : '';
    }
}
