<?php
declare(strict_types=1);
require_once __DIR__ . '/../models/DeliveryModel.php';
require_once __DIR__ . '/AreaManagerController.php';

final class DeliveryController
{
    public static function index(array $params = []): void
    {
        Auth::requireActiveAccount();
        Auth::requireRole(['area_manager']);
        $area = AreaManagerController::requireOperationalArea();
        Response::ok(DeliveryModel::listing($area['area_id'], ListQuery::page(), ListQuery::perPage(),
            ListQuery::enum('status', ['pending', 'assigned', 'in_transit', 'delivered', 'cancelled'])));
    }
}
