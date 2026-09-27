<?php
/**
 * Admin: the credential-document verification queue. Lists every user's
 * documents, streams one stored file so it can be opened in a new tab, and
 * records the verify / reject decision. routes.php restricts every endpoint
 * to the admin role.
 */

declare(strict_types=1);

require_once __DIR__ . '/../models/CredentialDocModel.php';
require_once __DIR__ . '/../services/DocumentVerificationService.php';
require_once __DIR__ . '/../core/Upload.php';

final class AdminDocumentController
{
    /** The roles that upload credential documents. */
    private const ROLES = ['renting_party', 'freelance_worker', 'maintenance_tech', 'delivery_personnel'];

    private const STATUSES = ['pending', 'verified', 'rejected'];

    /** Extension -> Content-Type for the files Upload::DOCUMENTS accepts. */
    private const FILE_TYPES = [
        'pdf'  => 'application/pdf',
        'jpg'  => 'image/jpeg',
        'png'  => 'image/png',
        'webp' => 'image/webp',
    ];

    /** GET /admin/documents?q=&role=&status=&page=&per_page= */
    public static function index(array $params = []): void
    {
        $filters = [
            'q'      => ListQuery::search(),
            'role'   => ListQuery::enum('role', self::ROLES),
            'status' => ListQuery::enum('status', self::STATUSES),
        ];
        $page    = ListQuery::page();
        $perPage = ListQuery::perPage();

        $total = CredentialDocModel::countForAdmin($filters);
        $rows  = CredentialDocModel::pageForAdmin($filters, $perPage, ($page - 1) * $perPage);

        $data = ListQuery::envelope($rows, $page, $perPage, $total);
        $data['summary'] = CredentialDocModel::summary();
        Response::ok($data);
    }

    /** GET /admin/documents/{id}/file — the stored file, inline, for a new tab. */
    public static function file(array $params = []): void
    {
        $doc      = self::find($params);
        $relative = (string) $doc['file_url'];
        $ext      = strtolower((string) pathinfo($relative, PATHINFO_EXTENSION));
        $full     = __DIR__ . '/../storage/' . $relative;

        // A path that didn't come out of Upload::store(), or a file that has
        // since been removed, is a 404 rather than a leak of the filesystem.
        if (strpos($relative, 'uploads/') !== 0
            || !Upload::isStoredPath($relative)
            || !isset(self::FILE_TYPES[$ext])
            || !is_file($full)
        ) {
            Response::error('Document file not found.', 404);
        }

        header('Content-Type: ' . self::FILE_TYPES[$ext]);
        header('Content-Length: ' . (string) filesize($full));
        header('Content-Disposition: inline; filename="document-' . (int) $doc['credential_doc_id'] . '.' . $ext . '"');
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');
        readfile($full);
        exit;
    }

    /** POST /admin/documents/{id}/verify */
    public static function verify(array $params = []): void
    {
        self::decide(self::find($params), 'verified', null);
    }

    /** POST /admin/documents/{id}/reject  {reason} */
    public static function reject(array $params = []): void
    {
        $doc    = self::find($params);
        $in     = Router::jsonBody();
        $reason = is_string($in['reason'] ?? null) ? trim($in['reason']) : '';

        $error = Validator::required($reason, 'Reason') ?? Validator::maxLength($reason, 255, 'Reason');
        if ($error !== null) {
            Response::error('Please fix the highlighted fields.', 422, ['reason' => $error]);
        }
        self::decide($doc, 'rejected', $reason);
    }

    private static function decide(array $doc, string $status, ?string $reason): void
    {
        if (!DocumentVerificationService::decide($doc, $status, (int) Auth::userId(), $reason)) {
            Response::error('This document has already been reviewed.', 422);
        }
        Response::ok([
            'credential_doc_id'   => (int) $doc['credential_doc_id'],
            'verification_status' => $status,
            'rejection_reason'    => $reason,
        ]);
    }

    /** @return array<string,mixed> the document, or ends the request with 404 */
    private static function find(array $params): array
    {
        $docId = filter_var($params['id'] ?? null, FILTER_VALIDATE_INT);
        $doc   = $docId === false || $docId < 1 ? null : CredentialDocModel::findForAdmin($docId);
        if ($doc === null) {
            Response::error('Document not found.', 404);
        }
        return $doc;
    }
}
