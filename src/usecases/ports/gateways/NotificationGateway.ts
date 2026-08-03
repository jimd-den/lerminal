/**
 * # Notification Gateway Interface
 *
 * ## Business Value & Purpose
 * A model call can take a minute. The user should be free to leave the app during one and
 * be told when it lands, rather than sitting on a spinner or coming back later to find out.
 * This is the port for that message.
 *
 * ## Why it is a port
 * The use-case layer decides *whether a completed job is worth interrupting someone over*;
 * only the framework layer knows how a notification is actually delivered on this platform.
 * Keeping the decision inward and the delivery outward also means the policy is testable
 * without a device, and a build with no notification support degrades to silence rather
 * than failing a run that already succeeded.
 */
export interface AppNotification {
  title: string;
  body: string;
  /**
   * Groups related notifications so a second finished job replaces the first rather than
   * stacking. Optional: without it every notification stands alone.
   */
  threadId?: string;
}

export interface NotificationGateway {
  /**
   * Asks the OS for permission, returning whether it was granted.
   *
   * Called before the first notification rather than at launch, so the prompt arrives
   * attached to something the user just started and can understand the reason for.
   */
  requestPermission(): Promise<boolean>;

  /**
   * Delivers one notification immediately.
   *
   * Must never throw: a failed notification is a missed convenience, not a failed run, and
   * it must not surface as an error on work that actually completed.
   */
  notify(notification: AppNotification): Promise<void>;
}
