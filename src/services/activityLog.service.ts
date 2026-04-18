import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

async function rpcSafe(fn: string, params: Record<string, any>): Promise<any> {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) {
    // User-friendly messages for common activity log errors
    if (error.message?.includes('check constraint') && error.message?.includes('action_check')) {
      const action = params.p_action || 'unknown';
      logger.error(
        { fn, action, error: error.message },
        `[ActivityLog] Action "${action}" is not registered in the database constraint. Please run the latest migration to update the allowed actions list.`
      );
    } else if (error.code === '23503') {
      logger.error(
        { fn, error: error.message },
        '[ActivityLog] Referenced record not found — the user or target may have been deleted.'
      );
    } else if (error.code === '23505') {
      logger.error(
        { fn, error: error.message },
        '[ActivityLog] Duplicate activity log entry detected — this event was already recorded.'
      );
    } else {
      logger.error({ fn, error: error.message }, '[ActivityLog] Failed to record activity — please check database connectivity and schema.');
    }
  }
  return data;
}

export const logAuth = (p: { userId?: number | null; action: string; identifier?: string | null; ip?: string | null; userAgent?: string | null; deviceType?: string | null; metadata?: any }) =>
  rpcSafe('log_auth_activity', { p_user_id: p.userId ?? null, p_action: p.action, p_identifier: p.identifier ?? null, p_ip: p.ip ?? null, p_user_agent: p.userAgent ?? null, p_device_type: p.deviceType ?? null, p_metadata: p.metadata ?? {} });

export const logAdmin = (p: { actorId: number; action: string; targetType?: string | null; targetId?: number | null; targetName?: string | null; changes?: any; ip?: string | null; metadata?: any }) =>
  rpcSafe('log_admin_activity', { p_actor_id: p.actorId, p_action: p.action, p_target_type: p.targetType ?? null, p_target_id: p.targetId ?? null, p_target_name: p.targetName ?? null, p_changes: p.changes ?? {}, p_ip: p.ip ?? null, p_metadata: p.metadata ?? {} });

export const logData = (p: { actorId: number; action: string; resourceType: string; resourceId?: number | null; resourceName?: string | null; changes?: any; ip?: string | null; metadata?: any }) =>
  rpcSafe('log_data_activity', { p_actor_id: p.actorId, p_action: p.action, p_resource_type: p.resourceType, p_resource_id: p.resourceId ?? null, p_resource_name: p.resourceName ?? null, p_changes: p.changes ?? {}, p_ip: p.ip ?? null, p_metadata: p.metadata ?? {} });

export const logSystem = (p: { level?: string; source?: string; action: string; message: string; userId?: number | null; ip?: string | null; endpoint?: string | null; httpMethod?: string | null; statusCode?: number | null; responseTime?: number | null; errorStack?: string | null; metadata?: any }) =>
  rpcSafe('log_system_activity', { p_level: p.level ?? 'info', p_source: p.source ?? 'api', p_action: p.action, p_message: p.message, p_user_id: p.userId ?? null, p_ip: p.ip ?? null, p_endpoint: p.endpoint ?? null, p_http_method: p.httpMethod ?? null, p_status_code: p.statusCode ?? null, p_response_time: p.responseTime ?? null, p_error_stack: p.errorStack ?? null, p_metadata: p.metadata ?? {} });

export const logStorage = (p: { actorId: number; action: string; resourceType: string; resourceId?: number | null; resourceName?: string | null; ip?: string | null; metadata?: any }) =>
  logData({ ...p, changes: {} });
