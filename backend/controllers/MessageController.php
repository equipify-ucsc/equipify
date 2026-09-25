<?php
declare(strict_types=1);

require_once __DIR__ . '/../models/MessageModel.php';

final class MessageController
{
    public const ROLES = ['customer', 'renting_party', 'freelance_worker', 'delivery_personnel', 'maintenance_tech'];
    public static function users(array $params = []): void
    {
        Auth::requireRole(self::ROLES);
        Response::ok(['items' => MessageModel::searchUsers((int) Auth::userId(), (string) Auth::role(), ListQuery::search('search')),
            'allowed_roles' => MessageModel::COUNTERPARTS[Auth::role()] ?? []]);
    }

    public static function startConversation(array $params = []): void
    {
        Auth::requireRole(self::ROLES);
        $input = Router::jsonBody();
        $target = filter_var($input['participant_user_id'] ?? null, FILTER_VALIDATE_INT);
        if ($target === false || $target < 1) Response::error('Select a valid person.', 422);
        try {
            $conversation = MessageModel::startConversation((int) Auth::userId(), (string) Auth::role(), $target);
        } catch (DomainException $e) { Response::error($e->getMessage(), 422); }
        Response::ok($conversation, $conversation['created'] ? 201 : 200);
    }

    public static function conversations(array $params = []): void
    {
        Auth::requireRole(self::ROLES);
        Response::ok(MessageModel::conversations((int) Auth::userId(), ListQuery::search(), ListQuery::page(), ListQuery::perPage(8)));
    }

    public static function messages(array $params = []): void
    {
        Auth::requireRole(self::ROLES);
        $id = self::conversationId($_GET['conversation_id'] ?? null);
        $snapshot = null;
        if (isset($_GET['snapshot_id'])) {
            $snapshot = filter_var($_GET['snapshot_id'], FILTER_VALIDATE_INT);
            if ($snapshot === false || $snapshot < 0) Response::error('Invalid message boundary.', 422);
        }
        try {
            $data = MessageModel::messages((int) Auth::userId(), $id, ListQuery::page(), ListQuery::perPage(12), $snapshot);
        } catch (DomainException $e) { Response::error($e->getMessage(), 404); }
        Response::ok($data);
    }

    public static function sendMessage(array $params = []): void
    {
        Auth::requireRole(self::ROLES);
        $input = Router::jsonBody();
        $id = self::conversationId($input['conversation_id'] ?? null);
        $body = is_string($input['body'] ?? null) ? trim($input['body']) : '';
        $error = Validator::required($body, 'Message') ?? Validator::maxLength($body, 2000, 'Message');
        if ($error !== null) Response::error('Please check your message.', 422, ['body' => $error]);
        if (!MessageModel::isParticipant((int) Auth::userId(), $id)) Response::error('Conversation not found.', 404);
        try {
            $message = MessageModel::insert((int) Auth::userId(), $id, $body);
        } catch (DomainException $e) { Response::error($e->getMessage(), 404); }
        Response::ok($message, 201);
    }

    private static function conversationId($value): int
    {
        $id = filter_var($value, FILTER_VALIDATE_INT);
        if ($id === false || $id < 1) Response::error('A valid conversation_id is required.', 422);
        return $id;
    }
}
