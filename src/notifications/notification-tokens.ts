/**
 * @file notification-tokens.ts
 * @description Injection tokens for the notifications module.
 *
 * `NotificationsService` is referenced by `AuditLoggingService` at runtime via
 * `ModuleRef.get()`. A direct file-level import from `audit-logging.service.ts`
 * would create a circular import chain
 * (`audit-logging → notifications → whatsapp → audit-logging`) that corrupts
 * Nest's reflected constructor metadata. Referencing the service through this
 * standalone token (which imports nothing) breaks that cycle while still
 * resolving the same singleton instance.
 */

export const NOTIFICATIONS_SERVICE_TOKEN = Symbol('NOTIFICATIONS_SERVICE_TOKEN');

/**
 * Injection token for `IntegrationAlertService`.
 *
 * `IntegrationAlertService` lives in the global `NotificationsModule` and
 * depends on `NotificationsService`. Services in modules that are imported by
 * `NotificationsModule` (eg. `CommunicationModule`, `WhatsAppModule`) or that
 * otherwise would create a module-level cycle must resolve the alert service
 * lazily through `ModuleRef.get()` rather than a constructor injection, to
 * avoid a circular module import graph.
 */
export const INTEGRATION_ALERT_SERVICE_TOKEN = Symbol('INTEGRATION_ALERT_SERVICE_TOKEN');
