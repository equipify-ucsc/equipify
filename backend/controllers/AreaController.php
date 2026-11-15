<?php
declare(strict_types=1);
require_once __DIR__ . '/../models/AreaModel.php';

final class AreaController
{
    public const MAX_DESCRIPTION_LENGTH = 5000;

    public static function index(array $params = []): void
    {
        Auth::requireActiveAccount();
        Auth::requireRole(['admin']);
        Response::ok(array_map([self::class, 'present'], AreaModel::all()));
    }

    public static function store(array $params = []): void
    {
        Auth::requireActiveAccount();
        Auth::requireRole(['admin']);
        [$name, $description] = self::input(0);
        try { $id = AreaModel::insert($name, $description); }
        catch (PDOException $e) { self::duplicateOrThrow($e); }
        Response::ok(self::present((array) AreaModel::find($id)), 201);
    }

    public static function update(array $params = []): void
    {
        Auth::requireActiveAccount();
        Auth::requireRole(['admin']);
        $id = (int) self::area($params)['area_id'];
        [$name, $description] = self::input($id);
        try { AreaModel::update($id, $name, $description); }
        catch (PDOException $e) { self::duplicateOrThrow($e); }
        Response::ok(self::present((array) AreaModel::find($id)));
    }

    public static function activate(array $params = []): void { self::status($params, true); }
    public static function deactivate(array $params = []): void { self::status($params, false); }

    private static function status(array $params, bool $active): void
    {
        Auth::requireActiveAccount();
        Auth::requireRole(['admin']);
        $id = (int) self::area($params)['area_id'];
        // The endpoint determines the status; contradictory payloads are rejected.
        $in = Router::jsonBody();
        if ($in !== []) Response::error('This action accepts an empty JSON object.', 422);
        AreaModel::setActive($id, $active);
        Response::ok(self::present((array) AreaModel::find($id)));
    }

    private static function area(array $params): array
    {
        $raw = $params['id'] ?? '';
        $id = is_string($raw) && preg_match('/\A[1-9][0-9]*\z/', $raw)
            ? filter_var($raw, FILTER_VALIDATE_INT) : false;
        if ($id === false) Response::error('Invalid area ID.', 422);
        $area = AreaModel::find($id);
        if ($area === null) Response::error('Area not found.', 404);
        return $area;
    }

    private static function input(int $exceptId): array
    {
        $in = Router::jsonBody();
        $errors = [];
        $name = is_string($in['name'] ?? null) ? trim($in['name']) : '';
        $message = Validator::required($name, 'Area name') ?? Validator::maxLength($name, 100, 'Area name');
        if ($message !== null) $errors['name'] = $message;
        elseif (preg_match('/[\x00-\x1f\x7f]/', $name)) $errors['name'] = 'Area name cannot contain control characters.';
        elseif (AreaModel::nameExists($name, $exceptId)) $errors['name'] = 'An area with this name already exists.';
        $description = $in['description'] ?? null;
        if ($description !== null && !is_string($description)) $errors['description'] = 'Description must be text.';
        else {
            $description = $description === null ? null : trim($description);
            if ($description === '') $description = null;
            if ($description !== null && (mb_strlen($description) > self::MAX_DESCRIPTION_LENGTH || strpos($description, "\0") !== false)) {
                $errors['description'] = 'Description must be at most 5000 characters and contain no null bytes.';
            }
        }
        foreach (array_diff(array_keys($in), ['name', 'description']) as $field) {
            $errors[(string) $field] = 'Only name and description can be edited here.';
        }
        if ($errors) Response::error('Please fix the highlighted fields.', 422, $errors);
        return [$name, $description];
    }

    private static function duplicateOrThrow(PDOException $e): void
    {
        // The UNIQUE constraint handles concurrent creates/renames too.
        if ((int) ($e->errorInfo[1] ?? 0) === 1062) {
            Response::error('Please fix the highlighted fields.', 422, ['name' => 'An area with this name already exists.']);
        }
        throw $e;
    }

    private static function present(array $row): array
    {
        $row['area_id'] = (int) $row['area_id'];
        $row['is_active'] = (bool) $row['is_active'];
        return $row;
    }
}
