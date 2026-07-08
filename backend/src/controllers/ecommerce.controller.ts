/**
 * E-ticaret operasyonları controller
 */

import { Response } from 'express';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
import { planHasModule, type PlanModuleKey } from '../services/plan-capabilities.service';
import { demoCompany } from '../demo/mockData';
import * as ecommerce from '../services/ecommerce.service';

async function requireEcommerceModule(
  req: AuthRequest,
  res: Response,
  module: PlanModuleKey
): Promise<boolean> {
  const allowed = isDemoSession(req)
    ? planHasModule(demoCompany.subscription_plan, module)
    : await ecommerce.companyHasEcommerceModule(req.companyId!, module);

  if (!allowed) {
    res.status(403).json({
      success: false,
      error: 'Bu özellik yalnızca E-ticaret paketinde kullanılabilir.',
    });
    return false;
  }
  return true;
}

async function hasEcommerceModule(req: AuthRequest, module: PlanModuleKey): Promise<boolean> {
  return isDemoSession(req)
    ? planHasModule(demoCompany.subscription_plan, module)
    : ecommerce.companyHasEcommerceModule(req.companyId!, module);
}

async function requireAnyEcommerceModule(
  req: AuthRequest,
  res: Response,
  modules: PlanModuleKey[]
): Promise<boolean> {
  for (const module of modules) {
    if (await hasEcommerceModule(req, module)) return true;
  }
  res.status(403).json({
    success: false,
    error: 'Bu özellik yalnızca E-ticaret paketinde kullanılabilir.',
  });
  return false;
}

function demoForbidden(res: Response): void {
  res.status(400).json({ success: false, error: 'Demo oturumunda e-ticaret verisi kaydedilemez.' });
}

export async function getSettings(req: AuthRequest, res: Response): Promise<void> {
  if (
    !(await requireAnyEcommerceModule(req, res, [
      'website',
      'order_status',
      'shipping_tracking',
      'cart',
      'returns',
    ]))
  ) {
    return;
  }

  if (isDemoSession(req)) {
    res.json({
      success: true,
      data: {
        company_id: demoCompany.id,
        store_name: 'Demo Mağaza',
        store_url: 'https://demo.example.com',
        provider: 'manual',
        api_base_url: null,
        api_key: null,
        api_enabled: false,
        api_auth_type: 'bearer',
        api_auth_header_name: 'Authorization',
        products_path: '/products',
        product_search_path: '/products/search',
        stock_path: '/products/{sku}/stock',
        order_status_path: '/orders/{orderNumber}',
        shipping_path: '/shipping/{trackingNumber}',
        api_connected_at: null,
        last_test_status: 'untested',
        last_test_at: null,
        last_test_message: null,
        order_status_enabled: true,
        shipping_tracking_enabled: true,
        cart_abandonment_enabled: true,
        returns_enabled: true,
        return_policy_text: '14 gün içinde iade kabul edilir.',
        cart_reminder_hours: 24,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
    return;
  }

  try {
    const data = await ecommerce.getEcommerceSettings(req.companyId!);
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ayarlar yüklenemedi';
    res.status(400).json({ success: false, error: message });
  }
}

export async function updateSettings(req: AuthRequest, res: Response): Promise<void> {
  if (
    !(await requireAnyEcommerceModule(req, res, [
      'website',
      'order_status',
      'shipping_tracking',
      'cart',
      'returns',
    ]))
  ) {
    return;
  }
  if (isDemoSession(req)) {
    demoForbidden(res);
    return;
  }

  try {
    const data = await ecommerce.upsertEcommerceSettings(req.companyId!, req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ayarlar kaydedilemedi';
    res.status(400).json({ success: false, error: message });
  }
}

export async function getOrders(req: AuthRequest, res: Response): Promise<void> {
  if (!(await requireEcommerceModule(req, res, 'order_status'))) return;

  if (isDemoSession(req)) {
    res.json({ success: true, data: [] });
    return;
  }

  try {
    const status = req.query.status as ecommerce.OrderStatus | undefined;
    const data = await ecommerce.listOrders(req.companyId!, status);
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Siparişler yüklenemedi';
    res.status(400).json({ success: false, error: message });
  }
}

export async function createOrder(req: AuthRequest, res: Response): Promise<void> {
  if (!(await requireEcommerceModule(req, res, 'order_status'))) return;
  if (isDemoSession(req)) {
    demoForbidden(res);
    return;
  }

  try {
    const data = await ecommerce.createOrder(req.companyId!, req.body || {});
    res.status(201).json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sipariş oluşturulamadı';
    res.status(400).json({ success: false, error: message });
  }
}

export async function patchOrder(req: AuthRequest, res: Response): Promise<void> {
  if (!(await requireEcommerceModule(req, res, 'order_status'))) return;
  if (isDemoSession(req)) {
    demoForbidden(res);
    return;
  }

  try {
    const data = await ecommerce.updateOrder(req.companyId!, String(req.params.id), req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sipariş güncellenemedi';
    res.status(400).json({ success: false, error: message });
  }
}

export async function getShipments(req: AuthRequest, res: Response): Promise<void> {
  if (!(await requireEcommerceModule(req, res, 'shipping_tracking'))) return;

  if (isDemoSession(req)) {
    res.json({ success: true, data: [] });
    return;
  }

  try {
    const status = req.query.status as ecommerce.ShipmentStatus | undefined;
    const data = await ecommerce.listShipments(req.companyId!, status);
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Kargo kayıtları yüklenemedi';
    res.status(400).json({ success: false, error: message });
  }
}

export async function createShipment(req: AuthRequest, res: Response): Promise<void> {
  if (!(await requireEcommerceModule(req, res, 'shipping_tracking'))) return;
  if (isDemoSession(req)) {
    demoForbidden(res);
    return;
  }

  try {
    const data = await ecommerce.createShipment(req.companyId!, req.body || {});
    res.status(201).json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Kargo kaydı oluşturulamadı';
    res.status(400).json({ success: false, error: message });
  }
}

export async function patchShipment(req: AuthRequest, res: Response): Promise<void> {
  if (!(await requireEcommerceModule(req, res, 'shipping_tracking'))) return;
  if (isDemoSession(req)) {
    demoForbidden(res);
    return;
  }

  try {
    const data = await ecommerce.updateShipment(
      req.companyId!,
      String(req.params.id),
      req.body || {}
    );
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Kargo kaydı güncellenemedi';
    res.status(400).json({ success: false, error: message });
  }
}

export async function getCarts(req: AuthRequest, res: Response): Promise<void> {
  if (!(await requireEcommerceModule(req, res, 'cart'))) return;

  if (isDemoSession(req)) {
    res.json({ success: true, data: [] });
    return;
  }

  try {
    const status = req.query.status as ecommerce.CartStatus | undefined;
    const data = await ecommerce.listCarts(req.companyId!, status);
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sepetler yüklenemedi';
    res.status(400).json({ success: false, error: message });
  }
}

export async function createCart(req: AuthRequest, res: Response): Promise<void> {
  if (!(await requireEcommerceModule(req, res, 'cart'))) return;
  if (isDemoSession(req)) {
    demoForbidden(res);
    return;
  }

  try {
    const data = await ecommerce.createCart(req.companyId!, req.body || {});
    res.status(201).json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sepet kaydı oluşturulamadı';
    res.status(400).json({ success: false, error: message });
  }
}

export async function patchCart(req: AuthRequest, res: Response): Promise<void> {
  if (!(await requireEcommerceModule(req, res, 'cart'))) return;
  if (isDemoSession(req)) {
    demoForbidden(res);
    return;
  }

  try {
    const data = await ecommerce.updateCart(req.companyId!, String(req.params.id), req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sepet güncellenemedi';
    res.status(400).json({ success: false, error: message });
  }
}

export async function getReturns(req: AuthRequest, res: Response): Promise<void> {
  if (!(await requireEcommerceModule(req, res, 'returns'))) return;

  if (isDemoSession(req)) {
    res.json({ success: true, data: [] });
    return;
  }

  try {
    const status = req.query.status as ecommerce.ReturnStatus | undefined;
    const data = await ecommerce.listReturns(req.companyId!, status);
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'İade talepleri yüklenemedi';
    res.status(400).json({ success: false, error: message });
  }
}

export async function createReturn(req: AuthRequest, res: Response): Promise<void> {
  if (!(await requireEcommerceModule(req, res, 'returns'))) return;
  if (isDemoSession(req)) {
    demoForbidden(res);
    return;
  }

  try {
    const data = await ecommerce.createReturnRequest(req.companyId!, req.body || {});
    res.status(201).json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'İade talebi oluşturulamadı';
    res.status(400).json({ success: false, error: message });
  }
}

export async function patchReturn(req: AuthRequest, res: Response): Promise<void> {
  if (!(await requireEcommerceModule(req, res, 'returns'))) return;
  if (isDemoSession(req)) {
    demoForbidden(res);
    return;
  }

  try {
    const data = await ecommerce.updateReturnRequest(
      req.companyId!,
      String(req.params.id),
      req.body || {}
    );
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'İade talebi güncellenemedi';
    res.status(400).json({ success: false, error: message });
  }
}

export async function testWebsiteApi(req: AuthRequest, res: Response): Promise<void> {
  if (!(await requireEcommerceModule(req, res, 'website'))) return;
  if (isDemoSession(req)) {
    res.json({
      success: true,
      data: {
        settings: null,
        test: { ok: true, message: 'Demo bağlantı başarılı', sampleProductCount: 0 },
      },
    });
    return;
  }

  try {
    const data = await ecommerce.testAndSaveWebsiteApi(req.companyId!);
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'API testi başarısız';
    res.status(400).json({ success: false, error: message });
  }
}
